import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

export interface DockerFactsInputs {
  readonly image: string;
  readonly version: string;
  readonly registries: readonly string[];
  readonly dockerfile: string;
  readonly context: string;
  readonly canaryLabel: string;
  readonly forcePush: boolean;
  readonly withLatest: boolean;
  readonly target: string;
  readonly prependTarget: boolean;
}

export interface DockerFactsGithubContext {
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

export interface DockerFactsResult {
  readonly context: string;
  readonly dockerfile: string;
  readonly target: string;
  readonly push: boolean;
  readonly tags: readonly string[];
  readonly buildArgs: Readonly<Record<string, string>>;
}

const COMPOSE_PATHS = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'] as const;

export function resolveDockerFacts(
  inputs: DockerFactsInputs,
  github: DockerFactsGithubContext
): DockerFactsResult {
  const explicitTarget = inputs.target;
  let contextAbsolute = resolvePath(github.workspace, inputs.context);
  let dockerfileAbsolute = findDockerfile(github.workspace, inputs.dockerfile, inputs.context);
  let target = explicitTarget;
  let buildArgs: Readonly<Record<string, string>> = {};

  const composeFile = findDockerCompose(github.workspace, inputs.context);
  if (composeFile) {
    const composeData = parseDockerCompose(composeFile, inputs.image);

    if (composeData.dockerfile) {
      if (composeData.context) {
        const composeContext = path.join(inputs.context, composeData.context);
        contextAbsolute = resolvePath(github.workspace, composeContext);
        const composeDockerfile = path.join(composeContext, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(github.workspace, composeDockerfile, contextAbsolute);
      } else {
        const composeDockerfile = path.join(inputs.context, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(github.workspace, composeDockerfile, contextAbsolute);
      }
    } else if (composeData.context) {
      const composeContext = path.join(inputs.context, composeData.context);
      contextAbsolute = resolvePath(github.workspace, composeContext);
      dockerfileAbsolute = findDockerfile(github.workspace, inputs.dockerfile, contextAbsolute);
    }

    if (composeData.target && explicitTarget.length === 0) {
      target = composeData.target;
    }

    buildArgs = composeData.buildArgs;
  }

  return {
    context: resolvePath(github.workspace, contextAbsolute, true),
    dockerfile: resolvePath(github.workspace, dockerfileAbsolute, true),
    target,
    push: shouldPushImage({
      eventName: github.eventName,
      ref: github.ref,
      defaultBranch: github.defaultBranch,
      canaryLabel: inputs.canaryLabel,
      forcePush: inputs.forcePush,
      eventPath: github.eventPath
    }),
    tags: generateTags({
      image: inputs.image,
      version: inputs.version,
      registries: inputs.registries,
      withLatest: inputs.withLatest,
      ref: github.ref,
      target,
      prependTarget: inputs.prependTarget
    }),
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

  for (const candidate of [...new Set(possiblePaths)]) {
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
        return { ...fallback, context: build };
      }
      if (!isRecord(build)) {
        return fallback;
      }

      const buildRecord = build as DockerComposeBuildRecord;
      return {
        dockerfile: typeof buildRecord.dockerfile === 'string' ? buildRecord.dockerfile : null,
        context: typeof buildRecord.context === 'string' ? buildRecord.context : null,
        target: typeof buildRecord.target === 'string' ? buildRecord.target : null,
        buildArgs: parseBuildArgs(buildRecord.args)
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

interface ShouldPushImageInput {
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
  if (input.ref === `refs/heads/${input.defaultBranch}` || input.ref.startsWith('refs/tags/')) {
    return true;
  }

  if (input.eventName === 'pull_request') {
    const labels = getPullRequestLabels(loadEventData(input.eventPath));
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
  const targetPrefix = input.prependTarget && input.target.length > 0 ? `${input.target}-` : '';
  const versionTag = input.version.startsWith('v')
    ? `${targetPrefix}${input.version}`
    : `${targetPrefix}v${input.version}`;

  const baseTags = [`${input.image}:${versionTag}`];
  if (input.withLatest && input.ref.startsWith('refs/tags/') && !isPreReleaseVersion(input.version)) {
    baseTags.push(`${input.image}:${targetPrefix}latest`);
  }

  const imageWithoutRegistry = stripRegistry(input.image);
  const output: string[] = [];
  for (const baseTag of baseTags) {
    output.push(baseTag);
    const [, tagValue = 'latest'] = baseTag.split(':');
    for (const registry of input.registries.filter((value) => value.length > 0)) {
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
    return Object.fromEntries(
      args
        .filter((value): value is string => typeof value === 'string' && value.includes('='))
        .map((pair) => {
          const [name, ...rest] = pair.split('=');
          return [name, rest.join('=')];
        })
    );
  }

  return {};
}

function serviceMatchesImage(service: DockerComposeServiceRecord, imageName: string): boolean {
  return typeof service.image === 'string' && service.image.startsWith(`${imageName}:`);
}

function loadEventData(eventPath?: string): unknown {
  if (!eventPath || !existsSync(eventPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8')) as unknown;
  } catch {
    return {};
  }
}

function getPullRequestLabels(eventData: unknown): readonly string[] {
  if (!isRecord(eventData) || !isRecord(eventData.pull_request) || !Array.isArray(eventData.pull_request.labels)) {
    return [];
  }

  return eventData.pull_request.labels
    .filter((label): label is { name: string } => isRecord(label) && typeof label.name === 'string')
    .map((label) => label.name);
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
  return ['alpha', 'beta', 'rc', 'dev'].some((token) => version.includes(token));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
