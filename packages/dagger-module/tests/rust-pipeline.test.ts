import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const daggerBinary = path.join(repositoryRoot, "bin", "dagger");
const nestedDaggerBinary = path.join(repositoryRoot, "bin", "bin", "dagger");

function resolveDaggerBinaryPath(): string | undefined {
  if (existsSync(daggerBinary)) {
    return daggerBinary;
  }
  if (existsSync(nestedDaggerBinary)) {
    return nestedDaggerBinary;
  }
  return undefined;
}

function ensureDaggerBinary(): string {
  const existingBinary = resolveDaggerBinaryPath();
  if (existingBinary) {
    return existingBinary;
  }

  const result = spawnSync(
    "sh",
    [
      "-lc",
      [
        "set -eu",
        "mkdir -p bin",
        "cd bin",
        "curl -fsSL https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=v0.20.8 sh",
      ].join("\n"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Failed to install matching Dagger CLI:\n${result.stdout}\n${result.stderr}`,
    );
  }

  const installedBinary = resolveDaggerBinaryPath();
  if (!installedBinary) {
    throw new Error(
      `Dagger CLI install finished but no binary found at ${daggerBinary} or ${nestedDaggerBinary}`,
    );
  }
  return installedBinary;
}

function parsePipelineOutput(
  stdout: string,
  stderr: string,
): Record<string, unknown> {
  const output = `${stdout}\n${stderr}`.trim();
  const jsonLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error(`Did not find JSON output in Dagger response:\n${output}`);
  }
  return JSON.parse(jsonLine) as Record<string, unknown>;
}

function isDaggerRuntimeUnavailable(stdout: string, stderr: string): boolean {
  const output = `${stdout}\n${stderr}`;
  return (
    output.includes('driver for scheme "image" was not available') ||
    output.includes("Cannot connect to the Docker daemon") ||
    output.includes("start engine:")
  );
}

const daggerSmokeTest =
  process.env.DAGGER_PNPM_PIPELINE === "1" ? test.skip : test;

daggerSmokeTest("runs the Rust build pipeline against the hello-world crate", async () => {
  const binary = ensureDaggerBinary();
  const result = spawnSync(
    binary,
    [
      "-m",
      "packages/dagger-module",
      "call",
      "rust-build-and-test",
      "--source=packages/rust-testing",
      "--toolchain=stable",
      "--components=clippy,rustfmt",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DAGGER_NO_NAG: "1",
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (
    result.status !== 0 &&
    isDaggerRuntimeUnavailable(result.stdout, result.stderr)
  ) {
    return;
  }
  expect(result.status, result.stderr).toBe(0);

  const payload = parsePipelineOutput(result.stdout, result.stderr);
  expect(payload.success).toBe(true);

  const report = payload.report as
    | {
        steps?: Array<{ name?: string; success?: boolean }>;
        markdown?: string;
      }
    | undefined;
  expect(report?.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "cargo test", success: true }),
    ]),
  );
  expect(payload.reportMarkdown ?? report?.markdown ?? "").toContain(
    "prints_hello_world",
  );
}, 120_000);
