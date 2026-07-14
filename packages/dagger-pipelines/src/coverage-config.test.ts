import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { DAGGER_COVERAGE_CONFIG } from "./coverage-config";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");

test("coverage config workflow and action paths resolve to real files", () => {
  for (const workflow of Object.values(DAGGER_COVERAGE_CONFIG.workflows)) {
    const workflowPath = path.join(repositoryRoot, workflow.path);
    expect(existsSync(workflowPath), `${workflow.path} must exist`).toBe(true);
  }

  for (const action of Object.values(DAGGER_COVERAGE_CONFIG.actions)) {
    const actionFile = path.join(repositoryRoot, action.path, "action.yml");
    expect(existsSync(actionFile), `${action.path}/action.yml must exist`).toBe(
      true,
    );
  }
});

test("coverage config workflow list stays in sync with workflow map and real files", () => {
  const workflowDir = path.join(repositoryRoot, ".github", "workflows");
  const actual = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();
  const configured = [...DAGGER_COVERAGE_CONFIG.workflowFiles];
  const workflowKeys = Object.keys(DAGGER_COVERAGE_CONFIG.workflows);

  expect(new Set(configured).size).toBe(configured.length);
  expect(new Set(workflowKeys).size).toBe(workflowKeys.length);
  expect([...configured].sort()).toEqual([...workflowKeys].sort());

  for (const workflowFile of configured) {
    expect(actual.includes(workflowFile), `${workflowFile} must exist`).toBe(
      true,
    );
  }
});

test("coverage config references only known command presets", () => {
  const presetIds = new Set(DAGGER_COVERAGE_CONFIG.commandPresets.map((p) => p.id));

  for (const action of Object.values(DAGGER_COVERAGE_CONFIG.actions)) {
    for (const refs of Object.values(action.presets)) {
      for (const presetId of refs ?? []) {
        expect(
          presetIds.has(presetId),
          `Action ${action.id} references unknown preset ${presetId}`,
        ).toBe(true);
      }
    }
  }

  for (const workflow of Object.values(DAGGER_COVERAGE_CONFIG.workflows)) {
    for (const refs of Object.values(workflow.presets)) {
      for (const presetId of refs ?? []) {
        expect(
          presetIds.has(presetId),
          `Workflow ${workflow.file} references unknown preset ${presetId}`,
        ).toBe(true);
      }
    }
  }
});
