import { type BuildArg, type Client, type Container, type Directory } from '@dagger.io/dagger';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveDockerParity,
  type DockerParityGithubContext,
  type DockerParityInputs,
  type DockerParityResult,
  findDockerCompose,
  findDockerfile,
  generateTags,
  parseDockerCompose,
  resolvePath as resolveDockerParityPath,
  shouldPushImage
} from './docker-parity.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];

export type PackageManager = 'pnpm' | 'npm' | 'yarn';
export type CommandArgs = readonly [string, ...string[]];

export interface CommandDefinition {
  readonly name: string;
  readonly args: CommandArgs;
  readonly env?: Readonly<Record<string, string>>;
  readonly workdir?: string;
}

export interface SourceConfig {
  readonly path?: string;
  readonly exclude?: readonly string[];
}

export interface BaseContainerConfig {
  readonly image?: string;
  readonly workdir?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface InstallConfig {
  readonly packageManager: PackageManager;
  readonly cacheKey?: string;
  readonly command?: CommandDefinition;
}

export interface CiConfig {
  readonly source?: SourceConfig;
  readonly container?: BaseContainerConfig;
  readonly install: InstallConfig;
  readonly lint: readonly CommandDefinition[];
  readonly test: readonly CommandDefinition[];
}

export interface RegistryAuthConfig {
  readonly address: string;
  readonly username: string;
  readonly passwordEnv: string;
}

export interface PublishConfig {
  readonly address: string;
  readonly auth?: RegistryAuthConfig | readonly RegistryAuthConfig[];
}

export interface DockerBuildConfig extends DockerParityInputs {
  readonly workspacePath?: string;
}

export interface BuildAndPushConfig {
  readonly source?: SourceConfig;
  readonly container?: BaseContainerConfig;
  readonly install: InstallConfig;
  readonly build: readonly CommandDefinition[];
  readonly publish: PublishConfig;
  readonly docker?: DockerBuildConfig;
}

export interface CiResult {
  readonly stdout: string;
}

export interface BuildAndPushResult {
  readonly reference: string;
  readonly references?: readonly string[];
  readonly pushed?: boolean;
  readonly tags?: readonly string[];
}

const PACKAGE_MANAGER_CACHE_PATHS: Record<PackageManager, string> = {
  pnpm: '/pnpm/store',
  npm: '/root/.npm',
  yarn: '/usr/local/share/.cache/yarn'
};

const DEFAULT_INSTALL_COMMANDS: Record<PackageManager, CommandArgs> = {
  pnpm: ['pnpm', 'install', '--frozen-lockfile'],
  npm: ['npm', 'ci'],
  yarn: ['yarn', 'install', '--immutable']
};

export function createBaseContainer(client: Client, config: BaseContainerConfig = {}): Container {
  const container = client
    .container()
    .from(config.image ?? 'node:22-bookworm-slim')
    .withWorkdir(config.workdir ?? '/workspace')
    .withEnvVariable('CI', 'true');

  return withEnv(container, config.env);
}

export function sourceDirectory(client: Client, config: SourceConfig = {}): Directory {
  return client.host().directory(config.path ?? '.', {
    exclude: config.exclude ? [...config.exclude] : undefined
  });
}

export function withMountedSource(container: Container, sourceDir: Directory): Container {
  return container.withMountedDirectory('.', sourceDir);
}

export function withDependencies(
  client: Client,
  container: Container,
  config: InstallConfig
): Container {
  const installCommand =
    config.command ??
    ({
      name: `${config.packageManager} install`,
      args: DEFAULT_INSTALL_COMMANDS[config.packageManager]
    } as const);

  return runCommand(
    container
      .withMountedCache(
        PACKAGE_MANAGER_CACHE_PATHS[config.packageManager],
        client.cacheVolume(config.cacheKey ?? `deps-${config.packageManager}`)
      )
      .withExec(['corepack', 'enable']),
    installCommand
  );
}

export function runCommand(container: Container, command: CommandDefinition): Container {
  const prepared = withEnv(
    command.workdir ? container.withWorkdir(command.workdir) : container,
    command.env
  );

  return prepared.withExec([...command.args]);
}

export function runCommands(container: Container, commands: readonly CommandDefinition[]): Container {
  return commands.reduce((current, command) => runCommand(current, command), container);
}

export async function ci(client: Client, config: CiConfig): Promise<CiResult> {
  const sourceDir = sourceDirectory(client, config.source);
  const prepared = withDependencies(
    client,
    withMountedSource(createBaseContainer(client, config.container), sourceDir),
    config.install
  );

  const executed = runCommands(runCommands(prepared, config.lint), config.test);
  return { stdout: await executed.stdout() };
}

export async function buildAndPush(
  client: Client,
  config: BuildAndPushConfig,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<BuildAndPushResult> {
  const sourceDir = sourceDirectory(client, config.source);
  const prepared = withDependencies(
    client,
    withMountedSource(createBaseContainer(client, config.container), sourceDir),
    config.install
  );

  const built = runCommands(prepared, config.build);

  if (config.docker) {
    const workspacePath = resolveWorkspacePath(config.source?.path, config.docker.workspacePath);
    const metadata = resolveDockerParity({
      inputs: config.docker,
      github: toDockerGithubContext(workspacePath, environment)
    });

    const dockerContainer = buildDockerContainer(built.directory('.'), metadata, workspacePath);
    if (!metadata.push) {
      return {
        reference: metadata.tags[0] ?? config.publish.address,
        pushed: false,
        tags: metadata.tags
      };
    }

    const publishContainer = withPublishAuth(client, dockerContainer, config.publish, environment);
    const references: string[] = [];
    for (const tag of metadata.tags) {
      references.push(await publishContainer.publish(tag));
    }

    return {
      reference: references[0] ?? config.publish.address,
      references,
      pushed: true,
      tags: metadata.tags
    };
  }

  const publishContainer = withPublishAuth(
    client,
    built.withDirectory('.', built.directory('.')),
    config.publish,
    environment
  );

  return { reference: await publishContainer.publish(config.publish.address) };
}

function buildDockerContainer(
  sourceDir: Directory,
  metadata: DockerParityResult,
  workspacePath: string
): Container {
  const contextSubpath = toWorkspaceSubpath(workspacePath, metadata.contextAbsolute);
  const dockerfileFromContext = normalizeSubpath(
    path.relative(metadata.contextAbsolute, metadata.dockerfileAbsolute)
  );

  const shouldBuildFromWorkspace =
    dockerfileFromContext.startsWith('..') || path.isAbsolute(dockerfileFromContext);

  if (shouldBuildFromWorkspace) {
    const workspaceDockerfile = normalizeSubpath(path.relative(workspacePath, metadata.dockerfileAbsolute));
    return sourceDir.dockerBuild({
      dockerfile: workspaceDockerfile,
      target: metadata.target || undefined,
      buildArgs: toDockerBuildArgs(metadata.buildArgs)
    });
  }

  const dockerBuildSource = contextSubpath === '.' ? sourceDir : sourceDir.directory(contextSubpath);
  return dockerBuildSource.dockerBuild({
    dockerfile: dockerfileFromContext,
    target: metadata.target || undefined,
    buildArgs: toDockerBuildArgs(metadata.buildArgs)
  });
}

function withEnv(
  container: Container,
  env: Readonly<Record<string, string>> | undefined
): Container {
  if (!env) {
    return container;
  }

  return Object.entries(env).reduce(
    (current, [key, value]) => current.withEnvVariable(key, value),
    container
  );
}

function withPublishAuth(
  client: Client,
  container: Container,
  publish: PublishConfig,
  environment: Readonly<Record<string, string | undefined>>
): Container {
  if (!publish.auth) {
    return container;
  }

  const authEntries = Array.isArray(publish.auth) ? publish.auth : [publish.auth];
  return authEntries.reduce((current, auth, index) => {
    const resolved = resolveRegistryAuth(auth, environment);

    const secretName = `${resolved.username}-${auth.address}-registry-auth-${index}`.replace(
      /[^a-zA-Z0-9_.-]/g,
      '-'
    );

    return current.withRegistryAuth(
      auth.address,
      resolved.username,
      client.setSecret(secretName, resolved.password)
    );
  }, container
  );
}

interface ResolvedRegistryAuth {
  readonly username: string;
  readonly password: string;
}

interface DockerConfigFile {
  readonly auths?: Readonly<Record<string, { readonly auth?: string }>>;
  readonly credsStore?: string;
  readonly credHelpers?: Readonly<Record<string, string>>;
}

function resolveRegistryAuth(
  auth: RegistryAuthConfig,
  environment: Readonly<Record<string, string | undefined>>
): ResolvedRegistryAuth {
  const passwordFromEnv = environment[auth.passwordEnv];
  if (passwordFromEnv) {
    return {
      username: auth.username,
      password: passwordFromEnv
    };
  }

  const dockerConfigAuth = readDockerConfigAuth(auth.address, environment);
  if (dockerConfigAuth) {
    return dockerConfigAuth;
  }

  throw new Error(
    `Missing registry credentials for ${auth.address}. Provide ${auth.passwordEnv} or login via Docker CLI.`
  );
}

function readDockerConfigAuth(
  registryAddress: string,
  environment: Readonly<Record<string, string | undefined>>
): ResolvedRegistryAuth | undefined {
  const configPath = resolveDockerConfigPath(environment);
  if (!existsSync(configPath)) {
    return undefined;
  }

  const configRaw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(configRaw) as DockerConfigFile;
  const auths = config.auths ?? {};
  const candidateKeys = dockerAuthKeys(registryAddress);

  for (const candidateKey of candidateKeys) {
    const encoded = auths[candidateKey]?.auth;
    if (!encoded) {
      continue;
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator <= 0) {
      continue;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  }

  for (const candidateKey of candidateKeys) {
    const helper = config.credHelpers?.[candidateKey];
    if (!helper) {
      continue;
    }

    const credentials = readDockerCredentialHelper(helper, candidateKey);
    if (credentials) {
      return credentials;
    }
  }

  if (config.credsStore) {
    for (const candidateKey of candidateKeys) {
      const credentials = readDockerCredentialHelper(config.credsStore, candidateKey);
      if (credentials) {
        return credentials;
      }
    }
  }

  return undefined;
}

function readDockerCredentialHelper(
  helperSuffix: string,
  serverAddress: string
): ResolvedRegistryAuth | undefined {
  const helperBinary = `docker-credential-${helperSuffix}`;
  const command = spawnSync(helperBinary, ['get'], {
    input: `${serverAddress}\n`,
    encoding: 'utf8'
  });
  if (command.status !== 0) {
    return undefined;
  }

  const output = command.stdout.trim();
  if (output.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(output) as { Username?: string; Secret?: string };
    if (!parsed.Username || !parsed.Secret) {
      return undefined;
    }

    return {
      username: parsed.Username,
      password: parsed.Secret
    };
  } catch {
    return undefined;
  }
}

function resolveDockerConfigPath(environment: Readonly<Record<string, string | undefined>>): string {
  const dockerConfig = environment.DOCKER_CONFIG;
  if (dockerConfig && dockerConfig.length > 0) {
    return dockerConfig.endsWith('.json')
      ? path.resolve(dockerConfig)
      : path.resolve(dockerConfig, 'config.json');
  }

  return path.join(os.homedir(), '.docker', 'config.json');
}

function dockerAuthKeys(registryAddress: string): readonly string[] {
  if (registryAddress === 'docker.io' || registryAddress === 'index.docker.io') {
    return ['https://index.docker.io/v1/', 'index.docker.io/v1/', 'docker.io'];
  }

  return [
    registryAddress,
    `https://${registryAddress}`,
    `${registryAddress}/v1/`,
    `https://${registryAddress}/v1/`
  ];
}

function toDockerBuildArgs(args: Readonly<Record<string, string>>): BuildArg[] | undefined {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([name, value]) => ({ name, value }));
}

function resolveWorkspacePath(sourcePath?: string, overridePath?: string): string {
  const basePath = overridePath ?? sourcePath ?? '.';
  return path.resolve(basePath);
}

function toDockerGithubContext(
  workspace: string,
  environment: Readonly<Record<string, string | undefined>>
): DockerParityGithubContext {
  return {
    workspace,
    eventName: environment.GITHUB_EVENT_NAME ?? '',
    ref: environment.GITHUB_REF ?? '',
    defaultBranch: environment.GITHUB_DEFAULT_BRANCH ?? 'main',
    eventPath: environment.GITHUB_EVENT_PATH
  };
}

function toWorkspaceSubpath(workspacePath: string, targetPath: string): string {
  return normalizeSubpath(path.relative(workspacePath, targetPath));
}

function normalizeSubpath(value: string): string {
  if (value.length === 0) {
    return '.';
  }

  return value.split(path.sep).join('/');
}

export type {
  ActionCoverageEntry,
  ActionId,
  CommandPreset,
  DaggerCoverageConfig,
  DaggerTask,
  TaskPresetRefs,
  Toolchain,
  WorkflowCoverageEntry,
  WorkflowFile
} from './config-types.js';
export { ACTION_IDS, COMMAND_PRESETS, DAGGER_COVERAGE_CONFIG, WORKFLOW_FILES } from './coverage-config.js';
export {
  resolveDockerReleasePublishAddress,
  type WorkflowEnvironment
} from './docker-release-semver.js';
export {
  findDockerCompose,
  findDockerfile,
  generateTags,
  parseDockerCompose,
  resolveDockerParity,
  resolveDockerParityPath,
  shouldPushImage,
  type DockerParityGithubContext,
  type DockerParityInputs,
  type DockerParityResult
};
export {
  buildNextSemverVersion,
  filterTagsByPrefix,
  normalizeTags,
  resolveSemverBase,
  type ResolveSemverBaseInput,
  type ResolveSemverVersionInput,
  type ResolvedSemverBase,
  type SemverIncrement
} from './semver.js';
