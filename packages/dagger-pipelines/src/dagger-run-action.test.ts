import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const daggerRunActionPath = path.join(
  repositoryRoot,
  ".github",
  "actions",
  "dagger-run",
  "action.yml",
);

interface DaggerRunAction {
  outputs?: Record<string, { value?: string }>;
  runs?: {
    steps?: Array<{
      id?: string;
      uses?: string;
      with?: Record<string, string>;
    }>;
  };
}

function loadDaggerRunAction(): DaggerRunAction {
  return parseYaml(
    readFileSync(daggerRunActionPath, "utf8"),
  ) as DaggerRunAction;
}

// Structured-envelope parsing/formatting behavior itself is unit-tested
// directly against the dagger-report action's source in
// .github/actions/dagger-report/src/report.test.ts and index.test.ts —
// dagger-run just needs to wire its raw Dagger stdout into that action.

test("dagger-run stdout output maps to dagger-for-github output with legacy fallback", () => {
  const action = loadDaggerRunAction();
  const stdoutOutput = action.outputs?.stdout?.value ?? "";

  expect(stdoutOutput).toContain("steps.dagger.outputs.output");
  expect(stdoutOutput).toContain("steps.dagger.outputs.stdout");
});

test("dagger-run delegates report surfacing to the dagger-report action", () => {
  const action = loadDaggerRunAction();
  const surfaceStep = (action.runs?.steps ?? []).find(
    (step) => step.id === "surface-report",
  );

  expect(surfaceStep?.uses).toBe("./.github/actions/dagger-report");
  const daggerStdout = surfaceStep?.with?.["dagger-stdout"] ?? "";
  expect(daggerStdout).toContain("steps.dagger.outputs.output");
  expect(daggerStdout).toContain("steps.dagger.outputs.stdout");
});

test("dagger-run re-exports report-markdown and pipeline-success from the surface-report step", () => {
  const action = loadDaggerRunAction();

  expect(action.outputs?.["report-markdown"]?.value).toBe(
    "${{ steps.surface-report.outputs.report-markdown }}",
  );
  expect(action.outputs?.["pipeline-success"]?.value).toBe(
    "${{ steps.surface-report.outputs.pipeline-success }}",
  );
});
