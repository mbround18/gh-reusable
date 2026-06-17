import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { expect, test } from "vitest";
import {
  ensureDaggerBinary,
  isDaggerRuntimeUnavailable,
  parsePipelineOutput,
  repositoryRoot,
} from "./dagger-smoke-utils";

const pnpmPipelineTest =
  process.env.DAGGER_PNPM_PIPELINE === "1" ? test.skip : test;

pnpmPipelineTest("runs the pnpm pipeline against the repo root", async () => {
  const binary = ensureDaggerBinary();
  const result = spawnSync(
    binary,
    [
      "-m",
      "packages/dagger-module",
      "call",
      "pnpm-build-and-test",
      "--source=.",
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
        steps?: Array<{
          name?: string;
          success?: boolean;
        }>;
        errors?: Array<unknown>;
      }
    | undefined;
  expect(report?.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "pnpm install", success: true }),
      expect.objectContaining({ name: "pnpm build", success: true }),
      expect.objectContaining({ name: "pnpm test", success: true }),
    ]),
  );
  expect(report?.errors ?? []).toEqual([]);
}, 120_000);

pnpmPipelineTest("rejects package.json files without build and test scripts", async () => {
  const binary = ensureDaggerBinary();
  const sourceDir = mkdtempSync(path.join(tmpdir(), "gh-reusable-pnpm-"));

  try {
    writeFileSync(
      path.join(sourceDir, "package.json"),
      JSON.stringify(
        {
          name: "missing-scripts",
          version: "1.0.0",
        },
        null,
        2,
      ),
    );

    const result = spawnSync(
      binary,
      [
        "-m",
        "packages/dagger-module",
        "call",
        "pnpm-build-and-test",
        `--source=${sourceDir}`,
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
    expect(payload.success).toBe(false);

    const report = payload.report as
      | {
          errors?: Array<{ step?: string; recommendedFix?: string }>;
        }
      | undefined;
    expect(report?.errors?.[0]?.step).toBe("package.json validation");
    expect(report?.errors?.[0]?.recommendedFix).toContain(
      "Add build and test scripts",
    );
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
  }
}, 120_000);
