import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

export interface DockerParityInputs {
  readonly image: string;
  readonly version: string;
  readonly registries?: readonly string[];
  readonly dockerfile?: string;
  readonly context?: string;
  readonly canaryLabel?: string;
  readonly forcePush?: boolean;
  readonly withLatest?: boolean;
  readonly target?: string;
  readonly prependTarget?: boolean;
}

export interface DockerParityGithubContext {
  readonly workspace: string;
  readonly eventName: string;
  readonly ref: string;
  readonly defaultBranch: string;
  readonly eventPath?: string;
}

interface ParseDockerComposeResult {
  readonly dockerfile: string | null;
  readonly context: string | null;
  readonly buildArgs: Readonly<Record<string, string>>;
  readonly target: string | null;
}

interface DockerComposeBuildRecord {
  readonly context?: unknown;
  readonly dockerfile?: unknown;
  readonly target?: unknown;
  readonly args?: unknown;
}

interface DockerComposeServiceRecord {
  readonly image?: unknown;
  readonly build?: unknown;
}

interface DockerComposeRecord {
  readonly services?: Readonly<Record<string, DockerComposeServiceRecord>>;
}

export interface DockerParityResult {
  readonly context: string;
  readonly contextAbsolute: string;
  readonly dockerfile: string;
  readonly dockerfileAbsolute: string;
  readonly target: string;
  readonly push: boolean;
  readonly tags: readonly string[];
  readonly buildArgs: Readonly<Record<string, string>>;
}

export interface ResolveDockerParityInput {
  readonly inputs: DockerParityInputs;
  readonly github: DockerParityGithubContext;
}

const DEFAULT_DOCKERFILE = './Dockerfile';
const DEFAULT_CONTEXT = '.';
const DEFAULT_CANARY_LABEL = 'canary';

const COMPOSE_PATHS = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'] as const;

export function resolveDockerParity(input: ResolveDockerParityInput): DockerParityResult {
  const dockerfileInput = input.inputs.dockerfile ?? DEFAULT_DOCKERFILE;
  const contextInput = input.inputs.context ?? DEFAULT_CONTEXT;
  const explicitTarget = input.inputs.target ?? '';

  const initialContextAbsolute = resolvePath(input.github.workspace, contextInput);
  let contextAbsolute = initialContextAbsolute;
  let dockerfileAbsolute = findDockerfile(input.github.workspace, dockerfileInput, contextInput);
  let target = explicitTarget;
  let buildArgs: Readonly<Record<string, string>> = {};

  const composeFile = findDockerCompose(input.github.workspace, contextInput);
  if (composeFile) {
    const composeData = parseDockerCompose(composeFile, input.inputs.image);

    if (composeData.dockerfile) {
      if (composeData.context) {
        const composeContext = path.join(contextInput, composeData.context);
        contextAbsolute = resolvePath(input.github.workspace, composeContext);
        const composeDockerfile = path.join(composeContext, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(input.github.workspace, composeDockerfile, contextAbsolute);
      } else {
        const composeDockerfile = path.join(contextInput, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(input.github.workspace, composeDockerfile, contextAbsolute);
      }
    } else if (composeData.context) {
      const composeContext = path.join(contextInput, composeData.context);
      contextAbsolute = resolvePath(input.github.workspace, composeContext);
      dockerfileAbsolute = findDockerfile(input.github.workspace, dockerfileInput, contextAbsolute);
    }

    if (composeData.target && explicitTarget.length === 0) {
      target = composeData.target;
    }

    buildArgs = composeData.buildArgs;
  }

  const push = shouldPushImage({
    eventName: input.github.eventName,
    ref: input.github.ref,
    defaultBranch: input.github.defaultBranch,
    canaryLabel: input.inputs.canaryLabel ?? DEFAULT_CANARY_LABEL,
    forcePush: input.inputs.forcePush ?? false,
    eventPath: input.github.eventPath
  });

  const tags = generateTags({
    image: input.inputs.image,
    version: input.inputs.version,
    registries: input.inputs.registries ?? [],
    withLatest: input.inputs.withLatest ?? false,
    ref: input.github.ref,
    target,
    prependTarget: input.inputs.prependTarget ?? false
  });

  return {
    context: resolvePath(input.github.workspace, contextAbsolute, true),
    contextAbsolute,
    dockerfile: resolvePath(input.github.workspace, dockerfileAbsolute, true),
    dockerfileAbsolute,
    target,
    push,
    tags,
    buildArgs
  };
}

export function resolvePath(workspace: string, value: string, toRelative = false): string {
  if (value.length === 0) {
    return '';
  }

  const normalizedWorkspace = path.resolve(workspace);
  if (toRelative) {
    const absoluteValue = path.resolve(value);
    if (absoluteValue.startsWith(normalizedWorkspace)) {
      const relativePath = path.relative(normalizedWorkspace, absoluteValue);
      return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    }

    return value;
  }

  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }

  return path.normalize(path.join(normalizedWorkspace, value.replace(/^[./]+/, '')));
}

export function findDockerfile(workspace: string, dockerfilePath: string, contextPath: string): string {
  const absoluteDockerfile = resolvePath(workspace, dockerfilePath);
  const absoluteContext = resolvePath(workspace, contextPath);

  const possiblePaths = [
    absoluteDockerfile,
    path.join(absoluteContext, path.basename(dockerfilePath)),
    path.join(absoluteContext, dockerfilePath.replace(/^[./]+/, ''))
  ];

  const uniquePaths = dedupe(possiblePaths);
  for (const candidate of uniquePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return absoluteDockerfile;
}

export function findDockerCompose(workspace: string, contextPath?: string): string | undefined {
  const normalizedWorkspace = path.resolve(workspace);

  for (const composePath of COMPOSE_PATHS) {
    const candidate = path.join(normalizedWorkspace, composePath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (contextPath && contextPath !== '.' && contextPath !== './') {
    const absoluteContext = resolvePath(normalizedWorkspace, contextPath);
    if (absoluteContext !== normalizedWorkspace) {
      for (const composePath of COMPOSE_PATHS) {
        const candidate = path.join(absoluteContext, composePath);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return undefined;
}

export function parseDockerCompose(filePath: string, imageName: string): ParseDockerComposeResult {
  const fallback: ParseDockerComposeResult = {
    dockerfile: null,
    context: null,
    buildArgs: {},
    target: null
  };

  try {
    const raw = readFileSync(filePath, 'utf8');
    const compose = parseYaml(raw) as DockerComposeRecord | null;
    if (!compose?.services) {
      return fallback;
    }

    for (const service of Object.values(compose.services)) {
      if (!serviceMatchesImage(service, imageName)) {
        continue;
      }

      const build = service.build;
      if (typeof build === 'string') {
        return {
          ...fallback,
          context: build
        };
      }

      if (!isComposeBuildRecord(build)) {
        return fallback;
      }

      return {
        dockerfile: typeof build.dockerfile === 'string' ? build.dockerfile : null,
        context: typeof build.context === 'string' ? build.context : null,
        target: typeof build.target === 'string' ? build.target : null,
        buildArgs: parseBuildArgs(build.args)
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export interface ShouldPushImageInput {
  readonly eventName: string;
  readonly ref: string;
  readonly defaultBranch: string;
  readonly canaryLabel: string;
  readonly forcePush: boolean;
  readonly eventPath?: string;
}

export function shouldPushImage(input: ShouldPushImageInput): boolean {
  if (input.forcePush) {
    return true;
  }

  if (input.ref === `refs/heads/${input.defaultBranch}`) {
    return true;
  }

  if (input.ref.startsWith('refs/tags/')) {
    return true;
  }

  if (input.eventName === 'pull_request') {
    const eventData = loadEventData(input.eventPath);
    const labels = getPullRequestLabels(eventData);
    return labels.includes(input.canaryLabel);
  }

  return false;
}

interface GenerateTagsInput {
  readonly image: string;
  readonly version: string;
  readonly registries: readonly string[];
  readonly withLatest: boolean;
  readonly ref: string;
  readonly target: string;
  readonly prependTarget: boolean;
}

export function generateTags(input: GenerateTagsInput): readonly string[] {
  const registries = input.registries.filter((registry) => registry.length > 0);
  const targetPrefix = input.prependTarget && input.target.length > 0 ? `${input.target}-` : '';

  const versionTag = input.version.startsWith('v')
    ? `${targetPrefix}${input.version}`
    : `${targetPrefix}v${input.version}`;

  const baseTags = [`${input.image}:${versionTag}`];
  const isReleaseVersion = input.ref.startsWith('refs/tags/') && !isPreReleaseVersion(input.version);

  if (input.withLatest && isReleaseVersion) {
    baseTags.push(`${input.image}:${targetPrefix}latest`);
  }

  const output: string[] = [];
  const imageWithoutRegistry = stripRegistry(input.image);
  for (const baseTag of baseTags) {
    output.push(baseTag);
    const [, tagValue = 'latest'] = baseTag.split(':');
    for (const registry of registries) {
      output.push(`${registry}/${imageWithoutRegistry}:${tagValue}`);
    }
  }

  return output;
}

function parseBuildArgs(args: unknown): Readonly<Record<string, string>> {
  if (isRecord(args)) {
    return Object.fromEntries(
      Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    );
  }

  if (Array.isArray(args)) {
    const pairs: Array<[string, string]> = [];
    for (const arg of args) {
      if (typeof arg !== 'string' || !arg.includes('=')) {
        continue;
      }

      const [name, ...valueParts] = arg.split('=');
      pairs.push([name, valueParts.join('=')]);
    }

    return Object.fromEntries(pairs);
  }

  return {};
}

function isComposeBuildRecord(value: unknown): value is DockerComposeBuildRecord {
  return isRecord(value);
}

function serviceMatchesImage(service: DockerComposeServiceRecord, imageName: string): boolean {
  return typeof service.image === 'string' && service.image.startsWith(`${imageName}:`);
}

function loadEventData(eventPath?: string): unknown {
  if (!eventPath || eventPath.length === 0 || !existsSync(eventPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(eventPath, 'utf8')) as unknown;
  } catch {
    return {};
  }
}

function getPullRequestLabels(eventData: unknown): readonly string[] {
  if (!isRecord(eventData)) {
    return [];
  }

  const pullRequest = eventData.pull_request;
  if (!isRecord(pullRequest) || !Array.isArray(pullRequest.labels)) {
    return [];
  }

  const labels: string[] = [];
  for (const label of pullRequest.labels) {
    if (isRecord(label) && typeof label.name === 'string') {
      labels.push(label.name);
    }
  }

  return labels;
}

function stripRegistry(image: string): string {
  if (!image.includes('/')) {
    return image;
  }

  const parts = image.split('/');
  const first = parts[0] ?? '';
  if (first.includes('.') || first === 'localhost' || first === 'ghcr' || first === 'docker') {
    return parts.slice(1).join('/');
  }

  return image;
}

function isPreReleaseVersion(version: string): boolean {
  return ['alpha', 'beta', 'rc', 'dev'].some((value) => version.includes(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
