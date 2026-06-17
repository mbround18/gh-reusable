import { spawnSync } from "node:child_process";

import { expect, test } from "vitest";
import {
  ensureDaggerBinary,
  isDaggerRuntimeUnavailable,
  parsePipelineOutput,
  repositoryRoot,
  shouldSkipDaggerSmokeTests,
} from "./dagger-smoke-utils";

const daggerSmokeTest =
  shouldSkipDaggerSmokeTests() ? test.skip : test;

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
