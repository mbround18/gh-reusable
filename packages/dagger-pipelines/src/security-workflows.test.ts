import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const workflowsDir = path.join(repositoryRoot, ".github", "workflows");

type WorkflowStep = {
  name?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
};

function readWorkflow(fileName: string): {
  on?: {
    workflow_call?: {
      inputs?: Record<string, { type?: string; default?: unknown }>;
    };
  };
  permissions?: Record<string, string>;
  jobs?: Record<
    string,
    {
      if?: string;
      uses?: string;
      with?: Record<string, unknown>;
      steps?: WorkflowStep[];
    }
  >;
} {
  return parse(readFileSync(path.join(workflowsDir, fileName), "utf8"));
}

test("codeql reusable workflow exposes secure defaults", () => {
  const workflow = readWorkflow("codeql.yaml");
  const inputs = workflow.on?.workflow_call?.inputs ?? {};
  const audit = workflow.jobs?.audit;

  expect(inputs.semgrep_config?.default).toBe("auto");
  expect(inputs.include_gitleaks?.default).toBe(true);
  expect(inputs.create_alerts?.default).toBe(true);
  expect(inputs["runs-on"]?.default).toBe("ubuntu-latest");

  expect(workflow.permissions?.["security-events"]).toBe("write");
  expect(workflow.permissions?.contents).toBe("write");
  expect(workflow.permissions?.["pull-requests"]).toBe("write");

  expect(audit?.uses).toContain(".github/workflows/audit.yaml");
  expect(String(audit?.with?.semgrep_config ?? "")).toContain(
    "inputs.semgrep_config",
  );
  expect(String(audit?.with?.include_gitleaks ?? "")).toContain(
    "inputs.include_gitleaks",
  );
  expect(String(audit?.with?.create_alerts ?? "")).toContain(
    "inputs.create_alerts",
  );
});

test("dependency review workflow runs only for pull requests", () => {
  const workflow = readWorkflow("dependency-review.yaml");
  const inputs = workflow.on?.workflow_call?.inputs ?? {};
  const audit = workflow.jobs?.audit;

  expect(inputs["runs-on"]?.default).toBe("ubuntu-latest");
  expect(inputs.semgrep_config?.default).toBe("auto");
  expect(inputs.create_alerts?.default).toBe(true);
  expect(workflow.permissions?.contents).toBe("write");
  expect(workflow.permissions?.["pull-requests"]).toBe("write");
  expect(workflow.permissions?.["security-events"]).toBe("write");
  expect(String(audit?.if ?? "")).toContain(
    "github.event_name == 'pull_request'",
  );
  expect(audit?.uses).toContain(".github/workflows/audit.yaml");
  expect(String(audit?.with?.semgrep_config ?? "")).toContain(
    "inputs.semgrep_config",
  );
  expect(String(audit?.with?.create_alerts ?? "")).toContain(
    "inputs.create_alerts",
  );
  expect(audit?.with?.include_gitleaks).toBe(false);
});

test("security workflow composes codeql and dependency review reusables", () => {
  const workflow = readWorkflow("security.yaml");
  const codeql = workflow.jobs?.codeql;
  const dependencyReview = workflow.jobs?.["dependency-review"];

  expect(codeql?.uses).toContain(".github/workflows/codeql.yaml");
  expect(String(codeql?.with?.semgrep_config ?? "")).toBe("auto");
  expect(codeql?.with?.include_gitleaks).toBe(true);
  expect(codeql?.with?.create_alerts).toBe(true);

  expect(dependencyReview?.uses).toContain(
    ".github/workflows/dependency-review.yaml",
  );
  expect(String(dependencyReview?.with?.semgrep_config ?? "")).toBe("auto");
  expect(dependencyReview?.with?.create_alerts).toBe(true);
});
