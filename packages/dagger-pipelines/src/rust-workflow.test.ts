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
  "rust-build-n-test.yaml",
);

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
};

function getWorkflow() {
  return parse(readFileSync(workflowPath, "utf8")) as {
    on?: {
      workflow_call?: {
        inputs?: Record<
          string,
          {
            type?: string;
            default?: unknown;
            required?: boolean;
          }
        >;
        secrets?: Record<string, unknown>;
      };
    };
    jobs?: Record<
      string,
      {
        if?: string;
        permissions?: Record<string, string>;
        steps?: WorkflowStep[];
      }
    >;
  };
}

test("rust reusable workflow exposes publish and docs opt-in inputs", () => {
  const workflow = getWorkflow();
  const inputs = workflow.on?.workflow_call?.inputs ?? {};

  expect(inputs.toolchain?.default).toBe("1.95");
  expect(inputs.publish?.type).toBe("boolean");
  expect(inputs.publish?.default).toBe(false);
  expect(inputs.publish_docs?.type).toBe("boolean");
  expect(inputs.publish_docs?.default).toBe(false);
  expect(inputs.registry?.default).toBe("crates.io");
  expect(inputs.docs_path?.default).toBe("target/doc");
});

test("rust reusable workflow declares conditional publish secret", () => {
  const workflow = getWorkflow();
  const secrets = workflow.on?.workflow_call?.secrets ?? {};

  expect(secrets.DAGGER_CLOUD_TOKEN).toBeDefined();
  expect(secrets.CARGO_REGISTRY_TOKEN).toBeDefined();
});

test("rust reusable workflow wires baseline, publish gate, and docs deployment", () => {
  const workflow = getWorkflow();
  const buildJob = workflow.jobs?.["rust-build-and-test"];
  const docsJob = workflow.jobs?.["publish-docs"];
  const steps = buildJob?.steps ?? [];

  expect(
    steps.some((step) =>
      step.with?.call?.includes("rust-pipeline --source=."),
    ),
  ).toBe(true);
  expect(
    steps.some(
      (step) =>
        step.with?.call?.includes("--publish=${{ inputs.publish }}") &&
        step.with?.call?.includes("--token=${{ secrets.CARGO_REGISTRY_TOKEN }}"),
    ),
  ).toBe(true);

  expect(docsJob?.if).toBe("inputs.publish_docs");
  expect(docsJob?.permissions).toBeUndefined();
  expect(
    String((docsJob as { uses?: string } | undefined)?.uses ?? "").includes(
      ".github/workflows/rust-docs-publish.yaml",
    ),
  ).toBe(true);
});

test("rust reusable workflow remains backward compatible for core build-test interface", () => {
  const workflow = getWorkflow();
  const inputNames = Object.keys(
    workflow.on?.workflow_call?.inputs ?? {},
  ).sort();

  expect(inputNames).toEqual(
    expect.arrayContaining([
      "toolchain",
      "components",
      "target",
      "name",
      "runs-on",
    ]),
  );
});
