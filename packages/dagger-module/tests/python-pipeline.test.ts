import { spawnSync } from "node:child_process";

import { expect, test } from "vitest";
import {
  ensureDaggerBinary,
  isDaggerRuntimeUnavailable,
  parsePipelineOutput,
  repositoryRoot,
} from "./dagger-smoke-utils";

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
