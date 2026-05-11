export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];

export type DaggerTask = 'install' | 'lint' | 'test' | 'build' | 'publish';

export type Toolchain =
  | 'pnpm'
  | 'npm'
  | 'cargo'
  | 'docker-buildx'
  | 'github-cli'
  | 'shell';

export type ActionId =
  | 'graphql'
  | 'docker-build'
  | 'github-catalog'
  | 'setup-rust'
  | 'install-cli'
  | 'ensure-repository'
  | 'semver'
  | 'docker-facts';

export type WorkflowFile =
  | 'docker-release.yaml'
  | 'rust-build-n-test.yml'
  | 'tagger.yaml'
  | 'test-docker-release.yaml'
  | 'test-ensure-repository.yml'
  | 'test-graphql-action.yaml'
  | 'test-install-cli.yaml'
  | 'test-rust-build-n-test.yml'
  | 'test-semver.yaml'
  | 'test-setup-rust.yaml'
  | 'update-readme.yml';

export interface CommandPreset {
  readonly id: string;
  readonly task: DaggerTask;
  readonly toolchain: Toolchain;
  readonly description: string;
  readonly command: readonly [string, ...string[]];
  readonly workdir?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface TaskPresetRefs {
  readonly install?: readonly string[];
  readonly lint?: readonly string[];
  readonly test?: readonly string[];
  readonly build?: readonly string[];
  readonly publish?: readonly string[];
}

export interface ActionCoverageEntry {
  readonly id: ActionId;
  readonly path: `actions/${ActionId}`;
  readonly runtime: 'docker' | 'composite';
  readonly toolchains: readonly Toolchain[];
  readonly presets: TaskPresetRefs;
}

export interface WorkflowCoverageEntry {
  readonly file: WorkflowFile;
  readonly path: `.github/workflows/${WorkflowFile}`;
  readonly actionCoverage: readonly ActionId[];
  readonly presets: TaskPresetRefs;
}

export interface DaggerCoverageConfig {
  readonly schemaVersion: 1;
  readonly actionIds: readonly ActionId[];
  readonly workflowFiles: readonly WorkflowFile[];
  readonly commandPresets: readonly CommandPreset[];
  readonly actions: Readonly<Record<ActionId, ActionCoverageEntry>>;
  readonly workflows: Readonly<Record<WorkflowFile, WorkflowCoverageEntry>>;
}
