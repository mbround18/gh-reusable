import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const workflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "spec-governance.yaml",
);

function readWorkflow(): {
  on?: {
    pull_request?: {
      paths?: string[];
      branches?: string[];
    };
  };
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
} {
  return parse(readFileSync(workflowPath, "utf8"));
}

test("spec governance workflow triggers on pipeline-impacting pull request changes", () => {
  const workflow = readWorkflow();
  const pr = workflow.on?.pull_request;
  const paths = pr?.paths ?? [];

  expect(pr?.branches).toEqual(["main"]);
  expect(paths).toEqual(
    expect.arrayContaining([
      ".github/workflows/**",
      ".github/actions/**",
      "packages/dagger-module/src/**",
      "packages/dagger-pipelines/src/**",
      "defaults.json",
      "defaults.schema.json",
    ]),
  );
});

test("spec governance workflow enforces required artifact sections", () => {
  const workflowRaw = readFileSync(workflowPath, "utf8");
  const workflow = parse(workflowRaw) as {
    permissions?: Record<string, string>;
    jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
  };
  const steps = workflow.jobs?.["enforce-spec-artifacts"]?.steps ?? [];
  const validateStep = steps.find(
    (step) =>
      step.name === "Validate spec artifacts for pipeline-impacting changes",
  );
  const script = validateStep?.run ?? "";

  expect(workflow.permissions?.contents).toBe("read");
  expect(workflow.permissions?.["pull-requests"]).toBe("read");
  expect(script).toContain("specs/pipeline-changes/.*\\.md");
  expect(script).toContain("## Summary");
  expect(script).toContain("## Affected Contracts");
  expect(script).toContain("## Compatibility Classification");
  expect(script).toContain("## Runtime and Defaults Impact");
  expect(script).toContain("## Security and Permissions Impact");
  expect(script).toContain("## Validation Plan");
  expect(script).toContain("## Consumer Impact and Migration");
  expect(script).toContain("## Rollout and Rollback");
  expect(script).toContain("## Exception Plan (if needed)");
  expect(script).toContain("Classification:\\s*(compatible|breaking)");
  expect(script).toContain("declares a breaking change");
});
