import type {
  ActionCoverageEntry,
  ActionId,
  CommandPreset,
  DaggerCoverageConfig,
  WorkflowCoverageEntry,
  WorkflowFile
} from './config-types';

export const ACTION_IDS = [
  'graphql',
  'docker-build',
  'github-catalog',
  'setup-rust',
  'install-cli',
  'ensure-repository',
  'semver',
  'docker-facts'
] as const satisfies readonly ActionId[];

export const WORKFLOW_FILES = [
  'docker-release.yaml',
  'rust-build-n-test.yml',
  'tagger.yaml',
  'test-docker-release.yaml',
  'test-ensure-repository.yml',
  'test-graphql-action.yaml',
  'test-install-cli.yaml',
  'test-rust-build-n-test.yml',
  'test-semver.yaml',
  'test-setup-rust.yaml',
  'update-readme.yml'
] as const satisfies readonly WorkflowFile[];

export const COMMAND_PRESETS = [
  {
    id: 'pnpm-install-frozen-lockfile',
    task: 'install',
    toolchain: 'pnpm',
    description: 'Install workspace dependencies from lockfile.',
    command: ['pnpm', 'install', '--frozen-lockfile']
  },
  {
    id: 'pnpm-workspace-build',
    task: 'build',
    toolchain: 'pnpm',
    description: 'Run all build scripts in the monorepo.',
    command: ['pnpm', '-r', '--if-present', 'run', 'build']
  },
  {
    id: 'pnpm-workspace-test',
    task: 'test',
    toolchain: 'pnpm',
    description: 'Run all package tests in the monorepo.',
    command: ['pnpm', '-r', '--if-present', 'run', 'test']
  },
  {
    id: 'pnpm-workspace-typecheck',
    task: 'lint',
    toolchain: 'pnpm',
    description: 'Run workspace type checks.',
    command: ['pnpm', '-r', '--if-present', 'run', 'typecheck']
  },
  {
    id: 'npm-ci',
    task: 'install',
    toolchain: 'npm',
    description: 'Install Node dependencies in CI mode.',
    command: ['npm', 'ci']
  },
  {
    id: 'npm-test',
    task: 'test',
    toolchain: 'npm',
    description: 'Run npm test.',
    command: ['npm', 'test']
  },
  {
    id: 'npm-run-build',
    task: 'build',
    toolchain: 'npm',
    description: 'Run npm build script.',
    command: ['npm', 'run', 'build']
  },
  {
    id: 'npm-run-typecheck',
    task: 'lint',
    toolchain: 'npm',
    description: 'Run npm typecheck script.',
    command: ['npm', 'run', 'typecheck']
  },
  {
    id: 'cargo-fetch-locked',
    task: 'install',
    toolchain: 'cargo',
    description: 'Fetch rust dependencies using Cargo.lock.',
    command: ['cargo', 'fetch', '--locked']
  },
  {
    id: 'cargo-fmt-check',
    task: 'lint',
    toolchain: 'cargo',
    description: 'Ensure Rust code formatting.',
    command: ['cargo', 'fmt', '--', '--check']
  },
  {
    id: 'cargo-clippy',
    task: 'lint',
    toolchain: 'cargo',
    description: 'Run clippy lint checks.',
    command: ['cargo', 'clippy']
  },
  {
    id: 'cargo-test-verbose',
    task: 'test',
    toolchain: 'cargo',
    description: 'Run Rust tests with verbose output.',
    command: ['cargo', 'test', '--verbose']
  },
  {
    id: 'cargo-build-verbose',
    task: 'build',
    toolchain: 'cargo',
    description: 'Build Rust debug artifacts.',
    command: ['cargo', 'build', '--verbose']
  },
  {
    id: 'cargo-build-release-verbose',
    task: 'build',
    toolchain: 'cargo',
    description: 'Build Rust release artifacts.',
    command: ['cargo', 'build', '--verbose', '--release']
  },
  {
    id: 'docker-buildx-build',
    task: 'build',
    toolchain: 'docker-buildx',
    description: 'Build OCI image with buildx.',
    command: ['docker', 'buildx', 'build']
  },
  {
    id: 'docker-buildx-build-push',
    task: 'publish',
    toolchain: 'docker-buildx',
    description: 'Build and push OCI image with buildx.',
    command: ['docker', 'buildx', 'build', '--push']
  },
  {
    id: 'gh-release-create',
    task: 'publish',
    toolchain: 'github-cli',
    description: 'Create GitHub release for a generated tag.',
    command: ['gh', 'release', 'create']
  },
  {
    id: 'shell-verify-repository',
    task: 'test',
    toolchain: 'shell',
    description: 'Assert the current GitHub repository matches expectation.',
    command: ['bash', '-lc', '[ "${GITHUB_REPOSITORY}" = "${EXPECTED_REPOSITORY}" ]']
  }
] as const satisfies readonly CommandPreset[];

const ACTIONS: Readonly<Record<ActionId, ActionCoverageEntry>> = {
  graphql: {
    id: 'graphql',
    path: 'actions/graphql',
    runtime: 'docker',
    toolchains: ['npm', 'docker-buildx'],
    presets: {
      install: ['npm-ci'],
      lint: ['npm-run-typecheck'],
      build: ['npm-run-build', 'docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'docker-build': {
    id: 'docker-build',
    path: 'actions/docker-build',
    runtime: 'composite',
    toolchains: ['docker-buildx', 'shell'],
    presets: {
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'github-catalog': {
    id: 'github-catalog',
    path: 'actions/github-catalog',
    runtime: 'docker',
    toolchains: ['npm', 'docker-buildx'],
    presets: {
      install: ['npm-ci'],
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'setup-rust': {
    id: 'setup-rust',
    path: 'actions/setup-rust',
    runtime: 'composite',
    toolchains: ['cargo', 'shell'],
    presets: {
      install: ['cargo-fetch-locked']
    }
  },
  'install-cli': {
    id: 'install-cli',
    path: 'actions/install-cli',
    runtime: 'composite',
    toolchains: ['shell'],
    presets: {
      test: ['shell-verify-repository']
    }
  },
  'ensure-repository': {
    id: 'ensure-repository',
    path: 'actions/ensure-repository',
    runtime: 'composite',
    toolchains: ['shell'],
    presets: {
      test: ['shell-verify-repository']
    }
  },
  semver: {
    id: 'semver',
    path: 'actions/semver',
    runtime: 'docker',
    toolchains: ['npm', 'docker-buildx'],
    presets: {
      install: ['npm-ci'],
      test: ['npm-test'],
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'docker-facts': {
    id: 'docker-facts',
    path: 'actions/docker-facts',
    runtime: 'docker',
    toolchains: ['npm', 'docker-buildx'],
    presets: {
      install: ['npm-ci'],
      test: ['npm-test'],
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  }
};

const WORKFLOWS: Readonly<Record<WorkflowFile, WorkflowCoverageEntry>> = {
  'docker-release.yaml': {
    file: 'docker-release.yaml',
    path: '.github/workflows/docker-release.yaml',
    actionCoverage: ['install-cli', 'semver', 'docker-facts'],
    presets: {
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'rust-build-n-test.yml': {
    file: 'rust-build-n-test.yml',
    path: '.github/workflows/rust-build-n-test.yml',
    actionCoverage: ['setup-rust'],
    presets: {
      install: ['cargo-fetch-locked'],
      lint: ['cargo-fmt-check', 'cargo-clippy'],
      test: ['cargo-test-verbose'],
      build: ['cargo-build-verbose', 'cargo-build-release-verbose']
    }
  },
  'tagger.yaml': {
    file: 'tagger.yaml',
    path: '.github/workflows/tagger.yaml',
    actionCoverage: ['semver'],
    presets: {
      publish: ['gh-release-create']
    }
  },
  'test-docker-release.yaml': {
    file: 'test-docker-release.yaml',
    path: '.github/workflows/test-docker-release.yaml',
    actionCoverage: ['ensure-repository', 'docker-facts'],
    presets: {
      install: ['npm-ci'],
      test: ['npm-test'],
      build: ['docker-buildx-build'],
      publish: ['docker-buildx-build-push']
    }
  },
  'test-ensure-repository.yml': {
    file: 'test-ensure-repository.yml',
    path: '.github/workflows/test-ensure-repository.yml',
    actionCoverage: ['ensure-repository'],
    presets: {
      test: ['shell-verify-repository']
    }
  },
  'test-graphql-action.yaml': {
    file: 'test-graphql-action.yaml',
    path: '.github/workflows/test-graphql-action.yaml',
    actionCoverage: ['graphql'],
    presets: {
      install: ['npm-ci'],
      lint: ['npm-run-typecheck'],
      build: ['npm-run-build']
    }
  },
  'test-install-cli.yaml': {
    file: 'test-install-cli.yaml',
    path: '.github/workflows/test-install-cli.yaml',
    actionCoverage: ['ensure-repository', 'install-cli'],
    presets: {
      test: ['shell-verify-repository']
    }
  },
  'test-rust-build-n-test.yml': {
    file: 'test-rust-build-n-test.yml',
    path: '.github/workflows/test-rust-build-n-test.yml',
    actionCoverage: ['ensure-repository', 'setup-rust'],
    presets: {
      install: ['cargo-fetch-locked'],
      lint: ['cargo-fmt-check', 'cargo-clippy'],
      test: ['cargo-test-verbose'],
      build: ['cargo-build-verbose', 'cargo-build-release-verbose']
    }
  },
  'test-semver.yaml': {
    file: 'test-semver.yaml',
    path: '.github/workflows/test-semver.yaml',
    actionCoverage: ['ensure-repository', 'semver'],
    presets: {
      install: ['npm-ci'],
      test: ['npm-test']
    }
  },
  'test-setup-rust.yaml': {
    file: 'test-setup-rust.yaml',
    path: '.github/workflows/test-setup-rust.yaml',
    actionCoverage: ['ensure-repository', 'setup-rust', 'install-cli'],
    presets: {
      install: ['cargo-fetch-locked'],
      test: ['cargo-build-verbose']
    }
  },
  'update-readme.yml': {
    file: 'update-readme.yml',
    path: '.github/workflows/update-readme.yml',
    actionCoverage: ['github-catalog'],
    presets: {
      install: ['npm-ci'],
      publish: ['gh-release-create']
    }
  }
};

export const DAGGER_COVERAGE_CONFIG = {
  schemaVersion: 1,
  actionIds: ACTION_IDS,
  workflowFiles: WORKFLOW_FILES,
  commandPresets: COMMAND_PRESETS,
  actions: ACTIONS,
  workflows: WORKFLOWS
} as const satisfies DaggerCoverageConfig;
