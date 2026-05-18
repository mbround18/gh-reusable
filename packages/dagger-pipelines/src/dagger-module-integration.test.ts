import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const workflowsDir = path.join(repositoryRoot, ".github", "workflows");
const moduleSourcePath = path.join(
  repositoryRoot,
  "packages",
  "dagger-module",
  "src",
  "index.ts",
);

function readModuleSource(): string {
  return readFileSync(moduleSourcePath, "utf8");
}

function getExportedModuleFunctionNames(source: string): string[] {
  const names: string[] = [];
  const matcher = /@func\(\)\s+async\s+([A-Za-z0-9_]+)\s*\(/g;
  let match: RegExpExecArray | null = matcher.exec(source);
  while (match !== null) {
    names.push(match[1]);
    match = matcher.exec(source);
  }
  return names;
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function listWorkflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort();
}

test("dagger module exports the object class required by the runtime", () => {
  const source = readModuleSource();
  expect(source).toContain("@object()");
  expect(source).toContain("export class GhReusablePipelines");
});

test("dagger module exposes expected integration entrypoints", () => {
  const exportedFunctions = getExportedModuleFunctionNames(readModuleSource());
  expect(exportedFunctions).toEqual(
    expect.arrayContaining([
      "audit",
      "ci",
      "dockerRelease",
      "publishHelmChart",
      "publishNpm",
      "publishPnpm",
      "publishRustCrate",
      "publishYarn",
      "rustBuildAndTest",
    ]),
  );
});

test("all dagger-for-github workflow integrations use module+call and no wrapper args", () => {
  const exportedCalls = new Set(
    getExportedModuleFunctionNames(readModuleSource()).map(toKebabCase),
  );
  const workflowFiles = listWorkflowFiles();
  const inspectedSteps: string[] = [];

  for (const workflowFile of workflowFiles) {
    const workflowPath = path.join(workflowsDir, workflowFile);
    const workflow = parse(readFileSync(workflowPath, "utf8")) as {
      jobs?: Record<string, { steps?: Array<Record<string, unknown>> }>;
    };
    const jobs = workflow.jobs ?? {};

    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = job.steps ?? [];
      for (const step of steps) {
        const uses = typeof step.uses === "string" ? step.uses : "";
        const withSection = (step.with ?? {}) as Record<string, unknown>;

        // Direct dagger-for-github usage (legacy path — should set module, call, DAGGER_NO_NAG)
        if (uses.startsWith("dagger/dagger-for-github@")) {
          const callValue = withSection.call;
          const moduleValue = withSection.module;
          const call = typeof callValue === "string" ? callValue.trim() : "";
          const moduleRef =
            typeof moduleValue === "string" ? moduleValue.trim() : "";
          const functionName = call.split(/\s+/)[0] ?? "";
          const envSection = (step.env ?? {}) as Record<string, unknown>;

          inspectedSteps.push(`${workflowFile}:${jobName} (direct)`);
          expect(
            moduleRef,
            `${workflowFile}:${jobName} must set with.module`,
          ).not.toBe("");
          expect(
            call,
            `${workflowFile}:${jobName} must set with.call`,
          ).not.toBe("");
          expect(
            envSection.DAGGER_NO_NAG,
            `${workflowFile}:${jobName} must set env.DAGGER_NO_NAG=1`,
          ).toBe("1");
          expect(
            withSection.verb,
            `${workflowFile}:${jobName} must not use with.verb`,
          ).toBeUndefined();
          expect(
            withSection.args,
            `${workflowFile}:${jobName} must not use with.args`,
          ).toBeUndefined();
          expect(
            exportedCalls.has(functionName),
            `${workflowFile}:${jobName} calls unknown module function "${functionName}"`,
          ).toBe(true);
          continue;
        }

        // Composite dagger-run action usage (preferred path — DAGGER_NO_NAG lives inside the action)
        if (
          uses.endsWith(".github/actions/dagger-run") ||
          uses === "./.github/actions/dagger-run"
        ) {
          const callValue = withSection.call;
          const call = typeof callValue === "string" ? callValue.trim() : "";
          const functionName = call.split(/\s+/)[0] ?? "";

          inspectedSteps.push(`${workflowFile}:${jobName} (composite)`);
          expect(
            call,
            `${workflowFile}:${jobName} must set with.call`,
          ).not.toBe("");
          expect(
            withSection.verb,
            `${workflowFile}:${jobName} must not use with.verb`,
          ).toBeUndefined();
          expect(
            withSection.args,
            `${workflowFile}:${jobName} must not use with.args`,
          ).toBeUndefined();
          expect(
            exportedCalls.has(functionName),
            `${workflowFile}:${jobName} calls unknown module function "${functionName}"`,
          ).toBe(true);
        }
      }
    }
  }

  expect(
    inspectedSteps.length,
    "no dagger steps found in any workflow — test may be misconfigured",
  ).toBeGreaterThan(0);
});
