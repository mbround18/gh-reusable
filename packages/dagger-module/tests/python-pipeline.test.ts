import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const daggerBinary = path.join(repositoryRoot, "bin", "dagger");

function ensureDaggerBinary(): string {
  if (existsSync(daggerBinary)) {
    return daggerBinary;
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

  return daggerBinary;
}

function parsePipelineOutput(stdout: string, stderr: string): Record<string, unknown> {
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

const daggerSmokeTest =
  process.env.DAGGER_PNPM_PIPELINE === "1" ? test.skip : test;

daggerSmokeTest(
  "runs the Python uv pipeline against the sample project",
  async () => {
    const binary = ensureDaggerBinary();
    const result = spawnSync(
      binary,
      [
        "-m",
        "packages/dagger-module",
        "call",
        "python-build-and-test",
        "--source=packages/python-testing",
        "--python-version=3.12",
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
    expect(result.status, result.stderr).toBe(0);

    const payload = parsePipelineOutput(result.stdout, result.stderr);
    expect(payload.success).toBe(true);

    const report = payload.report as
      | {
          steps?: Array<{
            name?: string;
            success?: boolean;
            stdout?: string;
          }>;
          markdown?: string;
        }
      | undefined;
    expect(report?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "uv run pytest", success: true }),
      ]),
    );
    const pytestStep = report?.steps?.find((step) => step.name === "uv run pytest");
    expect(pytestStep?.stdout ?? "").toContain("1 passed");
  },
  120_000,
);
