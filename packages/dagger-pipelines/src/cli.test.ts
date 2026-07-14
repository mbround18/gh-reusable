import { expect, test } from "vitest";
import {
  defaultBuildAndPushConfig,
  getArg,
  parseCommand,
  runCli,
} from "./cli.js";

test("parseCommand accepts supported commands and rejects invalid", () => {
  expect(parseCommand(["node", "cli.js", "ci"])).toBe("ci");
  expect(parseCommand(["node", "cli.js", "build-and-push"])).toBe(
    "build-and-push",
  );
  expect(parseCommand(["node", "cli.js", "workflow"])).toBe("workflow");
  expect(() => parseCommand(["node", "cli.js", "unknown"])).toThrow(
    "Expected command",
  );
});

test("getArg reads named argument values", () => {
  const argv = ["node", "cli.js", "workflow", "--id", "test-semver"];
  expect(getArg("--id", argv)).toBe("test-semver");
  expect(getArg("--missing", argv)).toBeUndefined();
  expect(getArg("--id", ["node", "cli.js", "--id"])).toBeUndefined();
});

test("defaultBuildAndPushConfig validates required environment", () => {
  expect(() => defaultBuildAndPushConfig({})).toThrow(
    "IMAGE_ADDRESS is required for build-and-push",
  );

  const config = defaultBuildAndPushConfig({
    IMAGE_ADDRESS: "ghcr.io/acme/demo:latest",
    REGISTRY_USERNAME: "octocat",
    REGISTRY_PASSWORD_ENV: "GHCR_TOKEN",
  });
  expect(config.publish.address).toBe("ghcr.io/acme/demo:latest");
  expect(config.publish.auth).toEqual({
    address: "ghcr.io",
    username: "octocat",
    passwordEnv: "GHCR_TOKEN",
  });
});

test("runCli handles compliance failures", async () => {
  const stderr: string[] = [];
  const exitCode = await runCli({
    argv: ["node", "cli.js", "ci"],
    evaluateCompliance: () => [
      { code: "broken", message: "workflow invalid" },
    ],
    writeStderr: (value) => stderr.push(value),
  });

  expect(exitCode).toBe(1);
  expect(stderr.join("")).toContain("Workflow definition compliance failed");
});

test("runCli executes ci command and writes stdout", async () => {
  const stdout: string[] = [];
  const exitCode = await runCli({
    argv: ["node", "cli.js", "ci"],
    evaluateCompliance: () => [],
    connectFn: async (fn) => {
      await fn({} as never);
      return undefined as never;
    },
    ciFn: async () => ({ stdout: "ci ok" }),
    writeStdout: (value) => stdout.push(value),
  });

  expect(exitCode).toBe(0);
  expect(stdout.join("")).toContain("ci ok");
});

test("runCli executes build-and-push command and writes reference", async () => {
  const stdout: string[] = [];
  const exitCode = await runCli({
    argv: ["node", "cli.js", "build-and-push"],
    environment: {
      IMAGE_ADDRESS: "docker.io/acme/app:latest",
    },
    evaluateCompliance: () => [],
    connectFn: async (fn) => {
      await fn({} as never);
      return undefined as never;
    },
    buildAndPushFn: async () => ({ reference: "docker.io/acme/app:v1.2.3" }),
    writeStdout: (value) => stdout.push(value),
  });

  expect(exitCode).toBe(0);
  expect(stdout.join("")).toContain("docker.io/acme/app:v1.2.3");
});

test("runCli enforces workflow --id and writes workflow outputs", async () => {
  const missingIdErr: string[] = [];
  const missingIdExit = await runCli({
    argv: ["node", "cli.js", "workflow"],
    evaluateCompliance: () => [],
    connectFn: async (fn) => {
      await fn({} as never);
      return undefined as never;
    },
    writeStderr: (value) => missingIdErr.push(value),
  });
  expect(missingIdExit).toBe(1);
  expect(missingIdErr.join("")).toContain("workflow command requires --id");

  const stdout: string[] = [];
  const okExit = await runCli({
    argv: ["node", "cli.js", "workflow", "--id", "test-semver"],
    evaluateCompliance: () => [],
    connectFn: async (fn) => {
      await fn({} as never);
      return undefined as never;
    },
    runWorkflowFn: async (_client, workflowId) => {
      if (workflowId === "test-semver") {
        return { stdout: "workflow ok" };
      }
      return { reference: "ref-123" };
    },
    writeStdout: (value) => stdout.push(value),
  });
  expect(okExit).toBe(0);
  expect(stdout.join("")).toContain("workflow ok");
});
