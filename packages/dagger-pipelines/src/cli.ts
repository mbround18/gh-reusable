import { connect } from "@dagger.io/dagger";

import {
  buildAndPush,
  ci,
  type BuildAndPushConfig,
  type CiConfig,
} from "./index.js";
import {
  evaluateWorkflowDefinitionCompliance,
  runWorkflow,
  type WorkflowId,
} from "./workflows.js";

export type CliCommand = "ci" | "build-and-push" | "workflow";

export function getArg(
  name: string,
  argv: readonly string[] = process.argv,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) {
    return undefined;
  }
  return argv[idx + 1];
}

export function parseCommand(
  argv: readonly string[] = process.argv,
): CliCommand {
  const command = argv[2];
  if (
    command === "ci" ||
    command === "build-and-push" ||
    command === "workflow"
  ) {
    return command;
  }

  throw new Error(
    "Expected command: 'ci', 'build-and-push', or 'workflow'. Example: node dist/cli.js workflow --id test-semver",
  );
}

export function defaultCiConfig(): CiConfig {
  return {
    source: { path: ".", exclude: ["**/node_modules", "**/.git"] },
    install: { packageManager: "pnpm", cacheKey: "dagger-ci-pnpm" },
    lint: [
      {
        name: "typecheck",
        args: ["pnpm", "-r", "--if-present", "run", "typecheck"],
      },
    ],
    test: [
      { name: "test", args: ["pnpm", "-r", "--if-present", "run", "test"] },
    ],
  };
}

export function defaultBuildAndPushConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BuildAndPushConfig {
  const address = environment.IMAGE_ADDRESS;
  if (!address) {
    throw new Error("IMAGE_ADDRESS is required for build-and-push");
  }

  const username = environment.REGISTRY_USERNAME;
  const passwordEnv = environment.REGISTRY_PASSWORD_ENV;
  const registryAddress = environment.REGISTRY_ADDRESS ?? address.split("/")[0];

  return {
    source: { path: ".", exclude: ["**/node_modules", "**/.git"] },
    install: { packageManager: "pnpm", cacheKey: "dagger-build-pnpm" },
    build: [
      { name: "build", args: ["pnpm", "-r", "--if-present", "run", "build"] },
    ],
    publish: {
      address,
      auth:
        username && passwordEnv
          ? {
              address: registryAddress,
              username,
              passwordEnv,
            }
          : undefined,
    },
  };
}

interface CliDependencies {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
  readonly connectFn: typeof connect;
  readonly ciFn: typeof ci;
  readonly buildAndPushFn: typeof buildAndPush;
  readonly runWorkflowFn: typeof runWorkflow;
  readonly evaluateCompliance: typeof evaluateWorkflowDefinitionCompliance;
}

function defaultDependencies(): CliDependencies {
  return {
    argv: process.argv,
    environment: process.env,
    writeStdout: (value) => process.stdout.write(value),
    writeStderr: (value) => process.stderr.write(value),
    connectFn: connect,
    ciFn: ci,
    buildAndPushFn: buildAndPush,
    runWorkflowFn: runWorkflow,
    evaluateCompliance: evaluateWorkflowDefinitionCompliance,
  };
}

export async function runCli(
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const deps = { ...defaultDependencies(), ...overrides };

  try {
    const complianceIssues = deps.evaluateCompliance();
    if (complianceIssues.length > 0) {
      throw new Error(
        `Workflow definition compliance failed: ${complianceIssues
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }

    const command = parseCommand(deps.argv);

    await deps.connectFn(async (client) => {
      if (command === "ci") {
        const result = await deps.ciFn(client, defaultCiConfig());
        deps.writeStdout(result.stdout);
        return;
      }

      if (command === "build-and-push") {
        const result = await deps.buildAndPushFn(
          client,
          defaultBuildAndPushConfig(deps.environment),
          deps.environment,
        );
        deps.writeStdout(`${result.reference}\n`);
        return;
      }

      const workflowId = getArg("--id", deps.argv) as WorkflowId | undefined;
      if (!workflowId) {
        throw new Error("workflow command requires --id <workflow-id>");
      }

      const result = await deps.runWorkflowFn(
        client,
        workflowId,
        deps.environment,
      );
      if ("stdout" in result) {
        deps.writeStdout(result.stdout);
        return;
      }

      deps.writeStdout(`${result.reference}\n`);
    });
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.writeStderr(`${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCli();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
