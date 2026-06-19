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
  "publish.yaml",
);

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
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
            description?: string;
          }
        >;
        secrets?: Record<string, unknown>;
      };
    };
    jobs?: Record<string, { steps?: WorkflowStep[]; if?: string }>;
  };
}

test("publish workflow exposes target input via workflow_call", () => {
  const workflow = getWorkflow();
  const target = workflow.on?.workflow_call?.inputs?.target;
  const publish = workflow.on?.workflow_call?.inputs?.publish;

  expect(target?.type).toBe("string");
  expect(target?.required).toBe(true);
  expect(target?.description).toContain("node");
  expect(target?.description).toContain("rust-crate");
  expect(target?.description).toContain("helm-chart");
  expect(publish?.type).toBe("boolean");
  expect(publish?.default).toBe(true);
});

test("publish workflow accepts publish secrets", () => {
  const workflow = getWorkflow();
  const secrets = workflow.on?.workflow_call?.secrets ?? {};

  expect(secrets.NPM_TOKEN).toBeDefined();
  expect(secrets.CARGO_REGISTRY_TOKEN).toBeDefined();
  expect(secrets.HELM_USERNAME).toBeDefined();
  expect(secrets.HELM_PASSWORD).toBeDefined();
  expect(secrets.DAGGER_CLOUD_TOKEN).toBeDefined();
});

test("publish workflow wires every publish entrypoint", () => {
  const workflow = getWorkflow();
  const jobs = workflow.jobs ?? {};

  expect(Object.keys(jobs)).toEqual(
    expect.arrayContaining(["publish-node", "publish-rust", "publish-helm"]),
  );

  const allSteps = Object.entries(jobs).flatMap(([jobName, job]) =>
    (job.steps ?? []).map((step) => ({ jobName, step })),
  );

  const daggerCalls = allSteps.filter(
    ({ step }) =>
      typeof step.uses === "string" &&
      step.uses.includes(".github/actions/dagger-run"),
  );
  expect(daggerCalls.length).toBeGreaterThanOrEqual(3);
  expect(
    daggerCalls.some(({ step }) => step.with?.call?.includes("publish-npm")),
  ).toBe(true);
  expect(
    daggerCalls.some(({ step }) => step.with?.call?.includes("--publish=")),
  ).toBe(true);
  expect(
    daggerCalls.some(({ step }) =>
      step.with?.call?.includes("publish-rust-crate"),
    ),
  ).toBe(true);
  expect(
    daggerCalls.some(({ step }) =>
      step.with?.call?.includes("publish-helm-chart"),
    ),
  ).toBe(true);

  // Each job should have report materialization and artifact upload steps
  expect(
    allSteps.some(({ step }) =>
      step.uses?.includes("actions/upload-artifact@"),
    ),
  ).toBe(true);
  expect(
    allSteps.some(({ step }) => step.uses?.includes("actions/github-script@")),
  ).toBe(true);
});

test("publish workflow interface remains backward compatible", () => {
  const workflow = getWorkflow();
  const inputNames = Object.keys(
    workflow.on?.workflow_call?.inputs ?? {},
  ).sort();
  const secretNames = Object.keys(
    workflow.on?.workflow_call?.secrets ?? {},
  ).sort();

  expect(inputNames).toEqual(
    expect.arrayContaining([
      "target",
      "source",
      "registry",
      "chart",
      "tag",
      "version",
      "publish",
      "runs-on",
    ]),
  );
  expect(secretNames).toEqual(
    expect.arrayContaining([
      "NPM_TOKEN",
      "CARGO_REGISTRY_TOKEN",
      "HELM_USERNAME",
      "HELM_PASSWORD",
      "DAGGER_CLOUD_TOKEN",
      "DISCORD_WEBHOOK_URL",
    ]),
  );
});
