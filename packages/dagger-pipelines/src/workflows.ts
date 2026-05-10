import type { Client } from '@dagger.io/dagger';

import {
  buildAndPush,
  ci,
  type BaseContainerConfig,
  type BuildAndPushConfig,
  type BuildAndPushResult,
  type CiConfig,
  type CiResult,
  type CommandArgs,
  type CommandDefinition,
  type PackageManager,
  type PublishConfig,
  type SourceConfig
} from './index.js';
import { resolveDockerReleasePublishAddress } from './docker-release-semver.js';

export type WorkflowId =
  | 'docker-release'
  | 'rust-build-n-test'
  | 'tagger'
  | 'test-docker-release'
  | 'test-ensure-repository'
  | 'test-graphql-action'
  | 'test-install-cli'
  | 'test-rust-build-n-test'
  | 'test-semver'
  | 'test-setup-rust'
  | 'update-readme';

interface WorkflowCommandConfig {
  readonly name: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly workdir?: string;
}

interface WorkflowInstallConfig {
  readonly packageManager: PackageManager;
  readonly cacheKey?: string;
  readonly command?: WorkflowCommandConfig;
}

interface RustSetupOptions {
  readonly toolchain?: string;
  readonly components?: string;
  readonly target?: string;
  readonly crates?: string;
}

interface WorkflowCiConfig {
  readonly source?: SourceConfig;
  readonly container?: BaseContainerConfig;
  readonly install: WorkflowInstallConfig;
  readonly lint: readonly WorkflowCommandConfig[];
  readonly test: readonly WorkflowCommandConfig[];
}

interface WorkflowBuildAndPushConfig {
  readonly source?: SourceConfig;
  readonly container?: BaseContainerConfig;
  readonly install: WorkflowInstallConfig;
  readonly build: readonly WorkflowCommandConfig[];
  readonly publish: PublishConfig;
  readonly docker?: BuildAndPushConfig['docker'];
}

interface CiWorkflowDefinition {
  readonly kind: 'ci';
  readonly config: WorkflowCiConfig;
}

interface BuildAndPushWorkflowDefinition {
  readonly kind: 'buildAndPush';
  readonly config: WorkflowBuildAndPushConfig;
}

export type WorkflowDefinition = CiWorkflowDefinition | BuildAndPushWorkflowDefinition;
export type WorkflowDefinitions = Readonly<Record<WorkflowId, WorkflowDefinition>>;

const SKIP_INSTALL_COMMAND = {
  name: 'skip install',
  args: ['bash', '-lc', 'true']
} as const satisfies WorkflowCommandConfig;

function bashWorkflowCommand(
  name: string,
  script: string,
  options?: Pick<WorkflowCommandConfig, 'env' | 'workdir'>
): WorkflowCommandConfig {
  return {
    name,
    args: ['bash', '-lc', `set -euo pipefail\n${script.trim()}`],
    env: options?.env,
    workdir: options?.workdir
  };
}

const DEFAULT_RUST_TOOLCHAIN = 'stable';
const DEFAULT_RUST_COMPONENTS = 'clippy rustfmt';
const DEFAULT_RUST_TARGET = '';

const RUST_SETUP_SCRIPT = [
  'toolchain="${RUST_TOOLCHAIN:-${INPUT_TOOLCHAIN:-stable}}"',
  'components_raw="${RUST_COMPONENTS:-${INPUT_COMPONENTS:-clippy rustfmt}}"',
  'targets_raw="${RUST_TARGETS:-${INPUT_TARGET:-}}"',
  'crates_raw="${RUST_CRATES:-${INPUT_CRATES:-}}"',
  '',
  'rustup toolchain install "$toolchain" --profile minimal',
  'rustup default "$toolchain"',
  '',
  'components_raw="${components_raw//,/ }"',
  'read -r -a components <<< "$components_raw"',
  'for component in "${components[@]}"; do',
  '  [ -n "$component" ] || continue',
  '  rustup component add --toolchain "$toolchain" "$component"',
  'done',
  '',
  'targets_raw="${targets_raw//,/ }"',
  'read -r -a targets <<< "$targets_raw"',
  'for target in "${targets[@]}"; do',
  '  [ -n "$target" ] || continue',
  '  rustup target add --toolchain "$toolchain" "$target"',
  'done',
  '',
  'crates_raw="${crates_raw//,/ }"',
  'read -r -a crates <<< "$crates_raw"',
  'for crate in "${crates[@]}"; do',
  '  [ -n "$crate" ] || continue',
  '  if command -v "$crate" >/dev/null 2>&1; then',
  '    continue',
  '  fi',
  '  cargo install --locked "$crate"',
  'done',
  '',
  'rustup show active-toolchain'
].join('\n');

const RUST_TARGET_BUILD_AND_TEST_SCRIPT = [
  'targets_raw="${RUST_TARGETS:-${INPUT_TARGET:-}}"',
  'targets_raw="${targets_raw//,/ }"',
  'read -r -a targets <<< "$targets_raw"',
  'for target in "${targets[@]}"; do',
  '  [ -n "$target" ] || continue',
  '  cargo build --verbose --target "$target"',
  '  cargo test --verbose --target "$target" --no-run',
  'done'
].join('\n');

function createRustSetupCommand(
  name: string,
  options: RustSetupOptions = {}
): WorkflowCommandConfig {
  const env: Record<string, string> = {};

  if (options.toolchain !== undefined) {
    env.RUST_TOOLCHAIN = options.toolchain;
  }
  if (options.components !== undefined) {
    env.RUST_COMPONENTS = options.components;
  }
  if (options.target !== undefined) {
    env.RUST_TARGETS = options.target;
  }
  if (options.crates !== undefined) {
    env.RUST_CRATES = options.crates;
  }

  return {
    name,
    args: ['bash', '-euo', 'pipefail', '-c', RUST_SETUP_SCRIPT],
    env: Object.keys(env).length > 0 ? env : undefined
  };
}

function createRustTargetBuildAndTestCommand(name: string): WorkflowCommandConfig {
  return {
    name,
    args: ['bash', '-euo', 'pipefail', '-c', RUST_TARGET_BUILD_AND_TEST_SCRIPT]
  };
}

export const WORKFLOW_DEFINITIONS = {
  'test-ensure-repository': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-ensure-repository',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        bashWorkflowCommand(
          'exercise ensure-repository guard logic',
          `
          check_repository() {
            expected="$1"
            actual="\${GITHUB_REPOSITORY:-}"

            if [ -z "$actual" ]; then
              echo "GITHUB_REPOSITORY is required for ensure-repository parity checks." >&2
              return 1
            fi

            if [ "$actual" != "$expected" ]; then
              echo "Repository mismatch! expected=$expected actual=$actual" >&2
              return 1
            fi
          }

          expected_repository='mbround18/gh-reusable'
          GITHUB_REPOSITORY='mbround18/gh-reusable' check_repository "$expected_repository"

          if GITHUB_REPOSITORY='octocat/hello-world' check_repository "$expected_repository"; then
            echo "Expected repository mismatch to fail." >&2
            exit 1
          fi
          `
        )
      ]
    }
  },
  'test-rust-build-n-test': {
    kind: 'ci',
    config: {
      container: {
        image: 'rust:1.89-bookworm',
        env: {
          CARGO_TERM_COLOR: 'always'
        }
      },
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-rust-build-n-test',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [
        createRustSetupCommand('setup rust toolchain', {
          toolchain: DEFAULT_RUST_TOOLCHAIN,
          components: DEFAULT_RUST_COMPONENTS,
          target: DEFAULT_RUST_TARGET
        }),
        {
          name: 'format check',
          args: ['cargo', 'fmt', '--', '--check']
        },
        {
          name: 'clippy check',
          args: ['cargo', 'clippy']
        }
      ],
      test: [
        {
          name: 'cargo build',
          args: ['cargo', 'build', '--verbose']
        },
        {
          name: 'cargo test',
          args: ['cargo', 'test', '--verbose']
        },
        createRustTargetBuildAndTestCommand('cargo build/test for configured targets'),
        {
          name: 'cargo release build',
          args: ['cargo', 'build', '--verbose', '--release']
        }
      ]
    }
  },
  'update-readme': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-update-readme',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        bashWorkflowCommand(
          'run github-catalog action with mocked graphql',
          `
          bootstrap='.dagger-workflows/update-readme-bootstrap.cjs'
          mkdir -p .dagger-workflows
          cat > "$bootstrap" <<'JS'
          const Module = require('module');
          const originalLoad = Module._load;

          Module._load = function patchedLoad(request, parent, isMain) {
            if (request === '@octokit/graphql') {
              return {
                graphql: {
                  defaults() {
                    return async () => ({
                      repository: {
                        refs: { nodes: [{ name: 'v0.0.0' }] },
                        defaultBranchRef: { name: 'main' }
                      }
                    });
                  }
                }
              };
            }

            return originalLoad.call(this, request, parent, isMain);
          };
          JS

          original_readme_hash="$(sha256sum README.md | cut -d ' ' -f1)"
          INPUT_TOKEN='mock-token' \
          GITHUB_REPOSITORY='mbround18/gh-reusable' \
          node -r "./$bootstrap" actions/github-catalog/index.js

          grep -q '<!-- GENERATED:GITHUB-CATALOG:START -->' README.md
          grep -q '<!-- GENERATED:GITHUB-CATALOG:STOP -->' README.md

          generated_readme_hash="$(sha256sum README.md | cut -d ' ' -f1)"
          if [ "$generated_readme_hash" != "$original_readme_hash" ]; then
            echo 'README.md changed after catalog generation; commit updated catalog output.' >&2
            exit 1
          fi
          `
        )
      ]
    }
  },
  'rust-build-n-test': {
    kind: 'ci',
    config: {
      container: {
        image: 'rust:1.89-bookworm',
        env: {
          CARGO_TERM_COLOR: 'always'
        }
      },
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-rust-build-n-test',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [
        createRustSetupCommand('setup rust toolchain', {
          toolchain: DEFAULT_RUST_TOOLCHAIN,
          components: DEFAULT_RUST_COMPONENTS,
          target: DEFAULT_RUST_TARGET
        }),
        {
          name: 'format check',
          args: ['cargo', 'fmt', '--', '--check']
        },
        {
          name: 'clippy check',
          args: ['cargo', 'clippy']
        }
      ],
      test: [
        {
          name: 'cargo build',
          args: ['cargo', 'build', '--verbose']
        },
        {
          name: 'cargo test',
          args: ['cargo', 'test', '--verbose']
        },
        createRustTargetBuildAndTestCommand('cargo build/test for configured targets'),
        {
          name: 'cargo release build',
          args: ['cargo', 'build', '--verbose', '--release']
        }
      ]
    }
  },
  'docker-release': {
    kind: 'buildAndPush',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-docker-release',
        command: SKIP_INSTALL_COMMAND
      },
      build: [
        {
          name: 'log docker release metadata',
          args: ['bash', '-lc', 'echo "Running Docker Release Workflow"']
        }
      ],
      publish: {
        address: 'docker.io/mbround18/gh-reusable-testing:latest',
        auth: {
          address: 'docker.io',
          username: 'mbround18',
          passwordEnv: 'DOCKER_TOKEN'
        }
      }
    }
  },
  tagger: {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-tagger',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        bashWorkflowCommand(
          'exercise semver and git tag creation flow',
          `
          npm --prefix actions/semver ci
          npm --prefix actions/semver test

          sandbox='.dagger-workflows/tagger-sandbox'
          rm -rf "$sandbox"
          mkdir -p "$sandbox"
          cd "$sandbox"

          git init --initial-branch=main
          git config user.name 'GitHub Action'
          git config user.email 'actions@no-reply.github.com'
          printf 'seed\\n' > README.md
          git add README.md
          git commit -m 'seed commit'

          tag_name='v0.1.0'
          if git rev-parse "$tag_name" >/dev/null 2>&1; then
            echo 'Tag unexpectedly existed before creation.' >&2
            exit 1
          fi

          git tag -a "$tag_name" -m "Release $tag_name"
          git rev-parse "$tag_name" >/dev/null

          if ! git rev-parse "$tag_name" >/dev/null 2>&1; then
            echo 'Expected existing tag check to detect tag.' >&2
            exit 1
          fi

          git tag -d "$tag_name" >/dev/null
          git tag -a "$tag_name" -m "Release $tag_name"
          gh release create --help >/dev/null
          `
        )
      ]
    }
  },
  'test-docker-release': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-docker-release',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        {
          name: 'verify docker release workflow exists',
          args: ['bash', '-lc', 'test -f .github/workflows/docker-release.yaml']
        },
        {
          name: 'verify docker facts test suite exists',
          args: ['bash', '-lc', 'test -f actions/docker-facts/src/lib.test.ts']
        }
      ]
    }
  },
  'test-graphql-action': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-graphql-action',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        bashWorkflowCommand(
          'build and exercise graphql action query flow',
          `
          npm --prefix actions/graphql ci
          npm --prefix actions/graphql run build

          node --input-type=module <<'NODE'
          import { createServer } from 'node:http';
          import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
          import path from 'node:path';
          import { tmpdir } from 'node:os';
          import { spawn } from 'node:child_process';

          const workspace = mkdtempSync(path.join(process.cwd(), '.dagger-graphql-'));
          const outputFile = path.join(workspace, 'github-output.txt');
          let requestBody = '';

          const server = createServer((req, res) => {
            let payload = '';
            req.on('data', (chunk) => {
              payload += String(chunk);
            });
            req.on('end', () => {
              requestBody = payload;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  data: { repository: { defaultBranchRef: { name: 'main' } } }
                })
              );
            });
          });

          await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
          const addressInfo = server.address();
          if (!addressInfo || typeof addressInfo === 'string') {
            throw new Error('Failed to start mock GraphQL server');
          }

          const child = spawn('node', ['actions/graphql/dist/index.js'], {
            cwd: process.cwd(),
            stdio: 'inherit',
            env: {
              ...process.env,
              INPUT_QUERY: 'query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { defaultBranchRef { name } } }',
              INPUT_ARGS: 'owner=mbround18, repo=gh-reusable',
              INPUT_TOKEN: 'test-token',
              INPUT_URL: \`http://127.0.0.1:\${addressInfo.port}/graphql\`,
              GITHUB_OUTPUT: outputFile
            }
          });

          const exitCode = await new Promise((resolve) => child.on('exit', resolve));
          await new Promise((resolve) => server.close(resolve));
          if (exitCode !== 0) {
            throw new Error(\`GraphQL action exited with code \${exitCode}\`);
          }

          if (!requestBody.includes('defaultBranchRef')) {
            throw new Error('Mock server did not receive default branch query');
          }
          if (!requestBody.includes('"owner":"mbround18"') || !requestBody.includes('"repo":"gh-reusable"')) {
            throw new Error('Mock server did not receive expected GraphQL variables');
          }

          const output = readFileSync(outputFile, 'utf8');
          if (!output.includes('result=')) {
            throw new Error('GraphQL action did not emit result output');
          }

          rmSync(workspace, { recursive: true, force: true });
          NODE
          `
        )
      ]
    }
  },
  'test-install-cli': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-install-cli',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        bashWorkflowCommand(
          'download and verify install-cli matrix binaries',
          `
          install_root='.dagger-workflows/install-cli'
          rm -rf "$install_root"
          mkdir -p "$install_root/bin" "$install_root/staging"
          export PATH="$install_root/bin:$PATH"

          resolve_latest_release() {
            repository="$1"
            owner="$(echo "$repository" | cut -d'/' -f1)"
            repo="$(echo "$repository" | cut -d'/' -f2)"
            curl -fsSL "https://api.github.com/repos/$owner/$repo/releases/latest" \
              | grep '"tag_name"' \
              | head -n1 \
              | cut -d'"' -f4
          }

          install_cli_release() {
            repository="$1"
            version="$2"
            asset_pattern="$3"
            override_name="$4"
            verify_command="$5"

            owner="$(echo "$repository" | cut -d'/' -f1)"
            repo="$(echo "$repository" | cut -d'/' -f2)"
            if [ -z "$version" ] || [ "$version" = 'latest' ]; then
              version="$(resolve_latest_release "$repository")"
            fi
            if [ -z "$version" ]; then
              echo "Unable to resolve release version for $repository" >&2
              return 1
            fi

            asset="$(echo "$asset_pattern" | sed "s/%VERSION%/$version/g")"
            download_path="$install_root/staging/$asset"
            download_url="https://github.com/$owner/$repo/releases/download/$version/$asset"
            curl -fsSL "$download_url" -o "$download_path"

            if [[ "$asset" == *.tar.gz ]]; then
              tar -xzf "$download_path" -C "$install_root/bin"
            elif [[ "$asset" == *.tar ]]; then
              tar -xf "$download_path" -C "$install_root/bin"
            elif [[ "$asset" == *.zip ]]; then
              unzip -q "$download_path" -d "$install_root/staging"
            else
              target_name="$override_name"
              if [ -z "$target_name" ]; then
                target_name="$(basename "$asset")"
              fi
              mv "$download_path" "$install_root/bin/$target_name"
            fi

            find "$install_root/bin" -mindepth 2 -type f -exec mv -t "$install_root/bin" {} +
            find "$install_root/bin" -type d -empty -delete

            if [ -n "$override_name" ] && [ ! -f "$install_root/bin/$override_name" ]; then
              first_binary="$(find "$install_root/bin" -maxdepth 1 -type f | head -n1)"
              if [ -n "$first_binary" ]; then
                mv "$first_binary" "$install_root/bin/$override_name"
              fi
            fi

            chmod +x "$install_root/bin"/* || true
            bash -lc "$verify_command"
          }

          install_cli_release 'schollz/croc' 'v10.0.12' 'croc_%VERSION%_Linux-64bit.tar.gz' '' 'croc --version'
          install_cli_release 'astral-sh/uv' 'latest' 'uv-x86_64-unknown-linux-gnu.tar.gz' '' 'uv --version'
          install_cli_release 'jqlang/jq' 'latest' 'jq-linux-amd64' 'jq' 'jq --version'
          `
        )
      ]
    }
  },
  'test-semver': {
    kind: 'ci',
    config: {
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-semver',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        {
          name: 'run semver npm tests',
          args: ['bash', '-lc', 'cd actions/semver && npm test']
        }
      ]
    }
  },
  'test-setup-rust': {
    kind: 'ci',
    config: {
      container: {
        image: 'rust:1.89-bookworm'
      },
      install: {
        packageManager: 'npm',
        cacheKey: 'workflow-test-setup-rust',
        command: SKIP_INSTALL_COMMAND
      },
      lint: [],
      test: [
        {
          name: 'verify rust setup action files exist',
          args: ['bash', '-lc', 'test -f actions/setup-rust/action.yml && test -f actions/install-cli/action.yml']
        },
        createRustSetupCommand('setup rust base toolchain', {
          toolchain: DEFAULT_RUST_TOOLCHAIN,
          components: 'clippy',
          target: '',
          crates: ''
        }),
        {
          name: 'verify clippy component installed',
          args: ['bash', '-euo', 'pipefail', '-c', 'rustup component list --installed | grep -E "^clippy"']
        },
        createRustSetupCommand('setup rust wasm toolchain', {
          toolchain: DEFAULT_RUST_TOOLCHAIN,
          components: 'clippy',
          target: 'wasm32-unknown-unknown',
          crates: 'trunk'
        }),
        {
          name: 'verify wasm target and trunk installed',
          args: [
            'bash',
            '-euo',
            'pipefail',
            '-c',
            'rustup target list --installed | grep -E "^wasm32-unknown-unknown$" && command -v trunk'
          ]
        }
      ]
    }
  }
} as const satisfies WorkflowDefinitions;

export type WorkflowEnvironment = Readonly<Record<string, string | undefined>>;

export function validateWorkflowDefinitions(
  definitions: WorkflowDefinitions = WORKFLOW_DEFINITIONS
): readonly string[] {
  const errors: string[] = [];

  for (const [workflowId, definition] of Object.entries(definitions) as readonly [
    WorkflowId,
    WorkflowDefinition
  ][]) {
    if (definition.kind === 'ci') {
      const commandCount = definition.config.lint.length + definition.config.test.length;
      if (commandCount === 0) {
        errors.push(`${workflowId}: ci workflow must include at least one command`);
      }

      validateCommands(errors, workflowId, [...definition.config.lint, ...definition.config.test]);
      if (definition.config.install.command) {
        validateCommands(errors, workflowId, [definition.config.install.command]);
      }
      continue;
    }

    if (definition.config.build.length === 0) {
      errors.push(`${workflowId}: buildAndPush workflow must include at least one build command`);
    }

    validateCommands(errors, workflowId, definition.config.build);
    if (definition.config.install.command) {
      validateCommands(errors, workflowId, [definition.config.install.command]);
    }
  }

  return errors;
}

const workflowDefinitionValidationErrors = validateWorkflowDefinitions(WORKFLOW_DEFINITIONS);
if (workflowDefinitionValidationErrors.length > 0) {
  throw new Error(
    `Invalid workflow definitions: ${workflowDefinitionValidationErrors.join('; ')}`
  );
}

export async function runWorkflow(
  client: Client,
  workflowId: WorkflowId,
  environment: WorkflowEnvironment = process.env
): Promise<CiResult | BuildAndPushResult> {
  const definition = WORKFLOW_DEFINITIONS[workflowId];

  if (definition.kind === 'ci') {
    return ci(client, toCiConfig(definition.config));
  }

  return buildAndPush(client, toBuildAndPushConfig(definition.config), environment);
}

export async function dockerReleaseWorkflow(
  client: Client,
  environment: WorkflowEnvironment = process.env
): Promise<BuildAndPushResult> {
  const workflowConfig = getBuildAndPushWorkflow('docker-release');
  const resolvedPublishAddress = resolveDockerReleasePublishAddress(
    workflowConfig.publish.address,
    environment
  );

  return buildAndPush(
    client,
    toBuildAndPushConfig({
      ...workflowConfig,
      docker: resolveDockerReleaseDockerConfig(resolvedPublishAddress, environment),
      publish: {
        ...workflowConfig.publish,
        address: resolvedPublishAddress
      }
    }),
    environment
  );
}

export async function rustBuildAndTestWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('rust-build-n-test')));
}

export async function taggerWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('tagger')));
}

export async function testDockerReleaseWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-docker-release')));
}

export async function testEnsureRepositoryWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-ensure-repository')));
}

export async function testGraphqlActionWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-graphql-action')));
}

export async function testInstallCliWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-install-cli')));
}

export async function testRustBuildAndTestWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-rust-build-n-test')));
}

export async function testSemverWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-semver')));
}

export async function testSetupRustWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('test-setup-rust')));
}

export async function updateReadmeWorkflow(client: Client): Promise<CiResult> {
  return ci(client, toCiConfig(getCiWorkflow('update-readme')));
}

export const workflowFunctions = {
  'docker-release': dockerReleaseWorkflow,
  'rust-build-n-test': rustBuildAndTestWorkflow,
  tagger: taggerWorkflow,
  'test-docker-release': testDockerReleaseWorkflow,
  'test-ensure-repository': testEnsureRepositoryWorkflow,
  'test-graphql-action': testGraphqlActionWorkflow,
  'test-install-cli': testInstallCliWorkflow,
  'test-rust-build-n-test': testRustBuildAndTestWorkflow,
  'test-semver': testSemverWorkflow,
  'test-setup-rust': testSetupRustWorkflow,
  'update-readme': updateReadmeWorkflow
} as const;

function getCiWorkflow(workflowId: WorkflowId): WorkflowCiConfig {
  const definition = WORKFLOW_DEFINITIONS[workflowId];
  if (definition.kind !== 'ci') {
    throw new Error(`${workflowId} is not a CI workflow`);
  }

  return definition.config;
}

function getBuildAndPushWorkflow(workflowId: WorkflowId): WorkflowBuildAndPushConfig {
  const definition = WORKFLOW_DEFINITIONS[workflowId];
  if (definition.kind !== 'buildAndPush') {
    throw new Error(`${workflowId} is not a buildAndPush workflow`);
  }

  return definition.config;
}

function toCiConfig(config: WorkflowCiConfig): CiConfig {
  return {
    source: config.source,
    container: config.container,
    install: {
      packageManager: config.install.packageManager,
      cacheKey: config.install.cacheKey,
      command: config.install.command ? toCommandDefinition(config.install.command) : undefined
    },
    lint: config.lint.map(toCommandDefinition),
    test: config.test.map(toCommandDefinition)
  };
}

function toBuildAndPushConfig(config: WorkflowBuildAndPushConfig): BuildAndPushConfig {
  return {
    source: config.source,
    container: config.container,
    install: {
      packageManager: config.install.packageManager,
      cacheKey: config.install.cacheKey,
      command: config.install.command ? toCommandDefinition(config.install.command) : undefined
    },
    build: config.build.map(toCommandDefinition),
    publish: config.publish,
    docker: config.docker
  };
}

function resolveDockerReleaseDockerConfig(
  publishAddress: string,
  environment: WorkflowEnvironment
): BuildAndPushConfig['docker'] {
  const [image, version] = splitAddressTag(publishAddress);
  const registries = (environment.DOCKER_RELEASE_REGISTRIES ?? environment.INPUT_REGISTRIES ?? '')
    .split(',')
    .map((registry) => registry.trim())
    .filter((registry) => registry.length > 0);

  return {
    image,
    version,
    registries,
    dockerfile: environment.DOCKER_RELEASE_DOCKERFILE ?? environment.INPUT_DOCKERFILE ?? './Dockerfile',
    context: environment.DOCKER_RELEASE_CONTEXT ?? environment.INPUT_CONTEXT ?? '.',
    canaryLabel: environment.DOCKER_RELEASE_CANARY_LABEL ?? environment.INPUT_CANARY_LABEL ?? 'canary',
    forcePush: parseBoolean(environment.DOCKER_RELEASE_FORCE_PUSH ?? environment.INPUT_FORCE_PUSH),
    withLatest: parseBoolean(environment.DOCKER_RELEASE_WITH_LATEST ?? environment.INPUT_WITH_LATEST),
    target: environment.DOCKER_RELEASE_TARGET ?? environment.INPUT_TARGET ?? '',
    prependTarget: parseBoolean(
      environment.DOCKER_RELEASE_PREPEND_TARGET ?? environment.INPUT_PREPEND_TARGET
    ),
    workspacePath: environment.GITHUB_WORKSPACE
  };
}

function splitAddressTag(address: string): readonly [string, string] {
  const lastColon = address.lastIndexOf(':');
  const lastSlash = address.lastIndexOf('/');
  if (lastColon > lastSlash) {
    return [address.slice(0, lastColon), address.slice(lastColon + 1)];
  }

  return [address, 'latest'];
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function toCommandDefinition(command: WorkflowCommandConfig): CommandDefinition {
  return {
    name: command.name,
    args: toCommandArgs(command.args),
    env: command.env,
    workdir: command.workdir
  };
}

function toCommandArgs(args: readonly string[]): CommandArgs {
  if (args.length === 0) {
    throw new Error('Command args must contain at least one value');
  }

  return [args[0], ...args.slice(1)] as CommandArgs;
}

function validateCommands(
  errors: string[],
  workflowId: WorkflowId,
  commands: readonly WorkflowCommandConfig[]
): void {
  for (const command of commands) {
    if (command.args.length === 0) {
      errors.push(`${workflowId}: command '${command.name}' has no executable arguments`);
    }
  }
}
