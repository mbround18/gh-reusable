import { connect } from '@dagger.io/dagger';

import { buildAndPush, ci, type BuildAndPushConfig, type CiConfig } from './index.js';
import { runWorkflow, type WorkflowId } from './workflows.js';

type CliCommand = 'ci' | 'build-and-push' | 'workflow';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function parseCommand(): CliCommand {
  const command = process.argv[2];
  if (command === 'ci' || command === 'build-and-push' || command === 'workflow') {
    return command;
  }

  throw new Error(
    "Expected command: 'ci', 'build-and-push', or 'workflow'. Example: node dist/cli.js workflow --id test-semver"
  );
}

function defaultCiConfig(): CiConfig {
  return {
    source: { path: '.', exclude: ['**/node_modules', '**/.git'] },
    install: { packageManager: 'pnpm', cacheKey: 'dagger-ci-pnpm' },
    lint: [{ name: 'typecheck', args: ['pnpm', '-r', '--if-present', 'run', 'typecheck'] }],
    test: [{ name: 'test', args: ['pnpm', '-r', '--if-present', 'run', 'test'] }]
  };
}

function defaultBuildAndPushConfig(): BuildAndPushConfig {
  const address = process.env.IMAGE_ADDRESS;
  if (!address) {
    throw new Error('IMAGE_ADDRESS is required for build-and-push');
  }

  const username = process.env.REGISTRY_USERNAME;
  const passwordEnv = process.env.REGISTRY_PASSWORD_ENV;
  const registryAddress = process.env.REGISTRY_ADDRESS ?? address.split('/')[0];

  return {
    source: { path: '.', exclude: ['**/node_modules', '**/.git'] },
    install: { packageManager: 'pnpm', cacheKey: 'dagger-build-pnpm' },
    build: [{ name: 'build', args: ['pnpm', '-r', '--if-present', 'run', 'build'] }],
    publish: {
      address,
      auth:
        username && passwordEnv
          ? {
              address: registryAddress,
              username,
              passwordEnv
            }
          : undefined
    }
  };
}

async function main(): Promise<void> {
  const command = parseCommand();

  await connect(async (client) => {
    if (command === 'ci') {
      const result = await ci(client, defaultCiConfig());
      process.stdout.write(result.stdout);
      return;
    }

    if (command === 'build-and-push') {
      const result = await buildAndPush(client, defaultBuildAndPushConfig(), process.env);
      process.stdout.write(`${result.reference}\n`);
      return;
    }

    const workflowId = getArg('--id') as WorkflowId | undefined;
    if (!workflowId) {
      throw new Error("workflow command requires --id <workflow-id>");
    }

    const result = await runWorkflow(client, workflowId, process.env);
    if ('stdout' in result) {
      process.stdout.write(result.stdout);
      return;
    }

    process.stdout.write(`${result.reference}\n`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
