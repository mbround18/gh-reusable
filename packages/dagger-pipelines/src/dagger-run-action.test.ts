import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

function loadSurfaceReportScript(): string {
  const action = loadDaggerRunAction();

  const surfaceStep = (action.runs?.steps ?? []).find(
    (step) => step.id === "surface-report",
  );
  if (!surfaceStep?.run) {
    throw new Error("surface-report step is missing from dagger-run action");
  }

  const match = surfaceStep.run.match(/node <<'NODE'\n([\s\S]*?)\nNODE\s*$/m);
  if (!match?.[1]) {
    throw new Error(
      "surface-report step no longer contains an embedded node heredoc",
    );
  }

  return match[1];
}

function loadDaggerRunAction(): {
  outputs?: Record<string, { value?: string }>;
  runs?: {
    steps?: Array<{ id?: string; run?: string; env?: Record<string, string> }>;
  };
} {
  return parseYaml(readFileSync(daggerRunActionPath, "utf8")) as {
    outputs?: Record<string, { value?: string }>;
    runs?: {
      steps?: Array<{ id?: string; run?: string; env?: Record<string, string> }>;
    };
  };
}

function parseGitHubOutput(content: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  const matcher = /([A-Za-z0-9_-]+)<<__GH_REUSABLE_EOF__\n([\s\S]*?)\n__GH_REUSABLE_EOF__/g;
  let match = matcher.exec(content);
  while (match) {
    outputs[match[1]] = match[2];
    match = matcher.exec(content);
  }
  return outputs;
}

function runSurfaceReportScript(rawStdout: string): {
  status: number | null;
  stdout: string;
  stderr: string;
  outputs: Record<string, string>;
} {
  const tempDir = mkdtempSync(path.join(tmpdir(), "gh-reusable-dagger-run-"));
  const githubOutputPath = path.join(tempDir, "github-output.txt");
  const result = spawnSync(process.execPath, ["-e", SURFACE_REPORT_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      DAGGER_STDOUT: rawStdout,
      GITHUB_OUTPUT: githubOutputPath,
    },
  });
  const outputContent = existsSync(githubOutputPath)
    ? readFileSync(githubOutputPath, "utf8")
    : "";

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    outputs: parseGitHubOutput(outputContent),
  };
}

const SURFACE_REPORT_SCRIPT = loadSurfaceReportScript();

test("surface-report fails when structured output reports failure", () => {
  const raw = JSON.stringify({
    success: false,
    reportMarkdown: "❌ failed report",
    report: { errors: [{ step: "rust-build-and-test" }] },
  });

  const result = runSurfaceReportScript(raw);

  expect(result.status).toBe(1);
  expect(result.outputs["report-markdown"]).toBe("❌ failed report");
  expect(result.outputs["pipeline-success"]).toBe("false");
  expect(result.stderr).toContain("Dagger pipeline reported failure");
});

test("surface-report passes and exports outputs for structured success payloads", () => {
  const raw = JSON.stringify({
    success: true,
    reportMarkdown: "✅ all good",
    report: { errors: [] },
  });

  const result = runSurfaceReportScript(raw);

  expect(result.status).toBe(0);
  expect(result.outputs["report-markdown"]).toBe("✅ all good");
  expect(result.outputs["pipeline-success"]).toBe("true");
  expect(result.stderr).toBe("");
});

test("surface-report parses JSON envelope from noisy stdout wrappers", () => {
  const payload = JSON.stringify({
    success: false,
    report: { markdown: "❌ noisy wrapper failure", errors: [] },
  });
  const raw = `prefix log line\n${payload}\nsuffix log line`;

  const result = runSurfaceReportScript(raw);

  expect(result.status).toBe(1);
  expect(result.outputs["report-markdown"]).toBe("❌ noisy wrapper failure");
  expect(result.outputs["pipeline-success"]).toBe("false");
});

test('surface-report fails closed for unparsable stdout containing `"success":false`', () => {
  const raw = 'dagger output: {"success":false missing-closing-brace';

  const result = runSurfaceReportScript(raw);

  expect(result.status).toBe(1);
  expect(result.outputs["report-markdown"]).toBe("");
  expect(result.outputs["pipeline-success"]).toBe("");
  expect(result.stderr).toContain("Raw Dagger stdout indicates success=false");
});

test("surface-report ignores plain non-JSON stdout", () => {
  const result = runSurfaceReportScript("plain unstructured stdout");

  expect(result.status).toBe(0);
  expect(result.outputs["report-markdown"]).toBe("");
  expect(result.outputs["pipeline-success"]).toBe("");
  expect(result.stderr).toBe("");
});

test("dagger-run stdout output maps to dagger-for-github output with legacy fallback", () => {
  const action = loadDaggerRunAction();
  const stdoutOutput = action.outputs?.stdout?.value ?? "";

  expect(stdoutOutput).toContain("steps.dagger.outputs.output");
  expect(stdoutOutput).toContain("steps.dagger.outputs.stdout");
});

test("surface-report reads dagger stdout from v8 output with legacy fallback", () => {
  const action = loadDaggerRunAction();
  const surfaceStep = (action.runs?.steps ?? []).find(
    (step) => step.id === "surface-report",
  );
  const daggerStdout = surfaceStep?.env?.DAGGER_STDOUT ?? "";

  expect(daggerStdout).toContain("steps.dagger.outputs.output");
  expect(daggerStdout).toContain("steps.dagger.outputs.stdout");
});
