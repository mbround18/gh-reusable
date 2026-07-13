import { describe, expect, test } from "vitest";
import {
  PipelineReporter,
  renderPipelineReportMarkdown,
  shellQuote,
  summarizeText,
  normalizeError,
} from "../src/reporting";

// ─── shellQuote ───────────────────────────────────────────────────────────────
// This function is used to build shell commands inside Dagger containers.
// A quoting bug is a shell injection vulnerability — critical to test.

describe("shellQuote", () => {
  test("wraps a plain string in single quotes", () => {
    expect(shellQuote("hello")).toBe("'hello'");
  });
  test("wraps a path in single quotes", () => {
    expect(shellQuote("/src/target/doc")).toBe("'/src/target/doc'");
  });
  test("escapes embedded single quotes using the '\\'' pattern", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
  test("escapes multiple embedded single quotes", () => {
    expect(shellQuote("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''");
  });
  test("handles version string with no special chars", () => {
    expect(shellQuote("1.2.3")).toBe("'1.2.3'");
  });
  test("handles version with pre-release including single quote (edge case)", () => {
    const quoted = shellQuote("1.0.0-beta.1");
    expect(quoted).toBe("'1.0.0-beta.1'");
    // Verify the quoted value is safe: no unquoted shell metacharacters
    expect(quoted).not.toMatch(/[`$\\]/);
  });
  test("handles empty string", () => {
    expect(shellQuote("")).toBe("''");
  });
  test("handles string with spaces", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });
  test("handles string with backslash", () => {
    // backslash inside single quotes is literal — no escaping needed
    expect(shellQuote("path\\to\\file")).toBe("'path\\to\\file'");
  });
  test("handles string with dollar sign (would be shell injection without quoting)", () => {
    expect(shellQuote("$HOME")).toBe("'$HOME'");
  });
  test("handles string with backtick (would be command substitution without quoting)", () => {
    expect(shellQuote("`id`")).toBe("'`id`'");
  });
  test("handles registry URL with slashes and colons", () => {
    expect(shellQuote("ghcr.io/org/app:v1.0.0")).toBe(
      "'ghcr.io/org/app:v1.0.0'",
    );
  });
});

// ─── summarizeText ───────────────────────────────────────────────────────────

describe("summarizeText", () => {
  test("returns short text unchanged", () => {
    expect(summarizeText("hello world")).toBe("hello world");
  });
  test("trims leading and trailing whitespace", () => {
    expect(summarizeText("  hello  ")).toBe("hello");
  });
  test("collapses internal whitespace into single spaces", () => {
    expect(summarizeText("hello\n\nworld")).toBe("hello world");
  });
  test("truncates long text to 200 chars by default", () => {
    const long = "a".repeat(300);
    const result = summarizeText(long);
    expect(result.length).toBeLessThanOrEqual(203); // truncate adds "..."
  });
  test("respects custom limit", () => {
    const long = "b".repeat(100);
    const result = summarizeText(long, 50);
    expect(result.length).toBeLessThanOrEqual(53);
  });
  test("returns empty string for empty input", () => {
    expect(summarizeText("")).toBe("");
  });
});

// ─── normalizeError ──────────────────────────────────────────────────────────

describe("normalizeError", () => {
  test("extracts message from an Error instance", () => {
    const err = new Error("something went wrong");
    const result = normalizeError(err);
    expect(result.message).toBe("something went wrong");
    expect(result.stderrSnippet).toBe("something went wrong");
  });
  test("converts string error to message", () => {
    const result = normalizeError("raw string error");
    expect(result.message).toBe("raw string error");
  });
  test("converts unknown type to string", () => {
    const result = normalizeError(42);
    expect(result.message).toBe("42");
  });
  test("extracts exit code from error message containing 'exit code N'", () => {
    const err = new Error("Process exited with exit code 1");
    const result = normalizeError(err);
    expect(result.exitCode).toBe(1);
  });
  test("returns undefined exitCode when message has no exit code", () => {
    const err = new Error("permission denied");
    const result = normalizeError(err);
    expect(result.exitCode).toBeUndefined();
  });
});

// ─── PipelineReporter ────────────────────────────────────────────────────────
// Tests the lifecycle: construct → startStep → endStep → recordError → finalize

describe("PipelineReporter — basic lifecycle", () => {
  function makeReporter(overrides: Record<string, string> = {}) {
    return new PipelineReporter({
      pipelineName: "test-pipeline",
      sourceDir: ".",
      version: "1.0.0",
      registryUrls: ["crates.io"],
      credentials: { MY_TOKEN: true },
      environment: {
        GITHUB_SHA: "abc123",
        GITHUB_REF_NAME: "main",
        GITHUB_REF: "refs/heads/main",
        ...overrides,
      },
    });
  }

  test("finalize returns a report with the pipeline name", () => {
    const reporter = makeReporter();
    const report = reporter.finalize();
    expect(report.metadata.pipelineName).toBe("test-pipeline");
  });

  test("finalize records git metadata from environment", () => {
    const reporter = makeReporter({ GITHUB_SHA: "deadbeef" });
    const report = reporter.finalize();
    expect(report.metadata.gitCommit).toBe("deadbeef");
    expect(report.metadata.branch).toBe("main");
  });

  test("finalize extracts tag from refs/tags/ ref", () => {
    const reporter = makeReporter({
      GITHUB_REF: "refs/tags/v1.2.3",
      GITHUB_REF_NAME: "v1.2.3",
    });
    const report = reporter.finalize();
    expect(report.metadata.tag).toBe("v1.2.3");
  });

  test("finalize leaves tag empty for branch ref", () => {
    const reporter = makeReporter({ GITHUB_REF: "refs/heads/main" });
    const report = reporter.finalize();
    expect(report.metadata.tag).toBe("");
  });

  test("finalize includes steps added via endStep", () => {
    const reporter = makeReporter();
    const step = reporter.startStep("cargo check", { command: "cargo check" });
    reporter.endStep(step, {
      success: true,
      stdout: "ok",
      stderr: "",
      stdoutSummary: "ok",
      stderrSummary: "",
      exitCode: 0,
    });
    const report = reporter.finalize();
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.name).toBe("cargo check");
    expect(report.steps[0]?.success).toBe(true);
    expect(report.steps[0]?.exitCode).toBe(0);
    expect(report.steps[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("finalize records failed steps correctly", () => {
    const reporter = makeReporter();
    const step = reporter.startStep("cargo build");
    reporter.endStep(step, {
      success: false,
      stdout: "",
      stderr: "error[E0001]: compile error",
      stdoutSummary: "",
      stderrSummary: "compile error",
      exitCode: 1,
    });
    const report = reporter.finalize();
    expect(report.steps[0]?.success).toBe(false);
    expect(report.steps[0]?.exitCode).toBe(1);
  });

  test("recordError appends to errors array", () => {
    const reporter = makeReporter();
    reporter.recordError("cargo check", "compile error", "fix your code");
    const report = reporter.finalize();
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.step).toBe("cargo check");
    expect(report.errors[0]?.recommendedFix).toBe("fix your code");
  });

  test("recordWarning appends to warnings array", () => {
    const reporter = makeReporter();
    reporter.recordWarning("cache miss");
    const report = reporter.finalize();
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toBe("cache miss");
  });

  test("setOutput stores arbitrary output values", () => {
    const reporter = makeReporter();
    reporter.setOutput("publishedVersion", "1.2.3");
    reporter.setOutput("registryUrls", ["crates.io"]);
    const report = reporter.finalize();
    expect(report.outputs.publishedVersion).toBe("1.2.3");
    expect(report.outputs.registryUrls).toEqual(["crates.io"]);
  });

  test("finalize always produces a markdown string", () => {
    const reporter = makeReporter();
    const report = reporter.finalize();
    expect(typeof report.markdown).toBe("string");
    expect(report.markdown.length).toBeGreaterThan(0);
    expect(report.markdown).toContain("test-pipeline");
  });

  test("errors list is empty for successful pipeline", () => {
    const reporter = makeReporter();
    const report = reporter.finalize();
    expect(report.errors).toHaveLength(0);
  });
});

// ─── renderPipelineReportMarkdown ────────────────────────────────────────────

describe("renderPipelineReportMarkdown", () => {
  const baseMetadata = {
    pipelineName: "publish-rust-crate",
    startTimestamp: "2024-01-01T00:00:00.000Z",
    endTimestamp: "2024-01-01T00:01:00.000Z",
    gitCommit: "abc123",
    branch: "main",
    tag: "",
    daggerEngineVersion: "v0.20.8",
  };
  const baseInputs = {
    sourceDir: ".",
    version: "1.0.0",
    registryUrls: ["crates.io"],
    credentials: { CARGO_REGISTRY_TOKEN: true },
  };

  test("shows ✅ header when no errors", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      {},
      [],
    );
    expect(md).toContain("✅");
    expect(md).toContain("publish-rust-crate");
  });

  test("shows ❌ header when errors present", () => {
    const error = {
      step: "cargo check",
      stderrSnippet: "compile error",
      rawLog: "compile error",
      recommendedFix: "fix it",
    };
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      {},
      [error],
    );
    expect(md).toContain("❌");
  });

  test("includes git metadata in table", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      {},
      [],
    );
    expect(md).toContain("abc123");
    expect(md).toContain("main");
    expect(md).toContain("v0.20.8");
  });

  test("shows 'n/a' when tag is empty", () => {
    const md = renderPipelineReportMarkdown(
      { ...baseMetadata, tag: "" },
      baseInputs,
      [],
      {},
      [],
    );
    expect(md).toContain("Tag");
    expect(md).toContain("n/a");
  });

  test("shows tag value when set", () => {
    const md = renderPipelineReportMarkdown(
      { ...baseMetadata, tag: "v1.2.3" },
      baseInputs,
      [],
      {},
      [],
    );
    expect(md).toContain("v1.2.3");
  });

  test("renders successful step with ✅", () => {
    const step = {
      name: "cargo publish",
      startedAt: "2024-01-01T00:00:00.000Z",
      endedAt: "2024-01-01T00:00:05.000Z",
      durationMs: 5000,
      success: true,
      stdout: "",
      stderr: "",
      stdoutSummary: "",
      stderrSummary: "",
    };
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [step],
      {},
      [],
    );
    expect(md).toContain("✅");
    expect(md).toContain("cargo publish");
    expect(md).toContain("5000ms");
  });

  test("renders failed step with ❌ and includes in Failure logs", () => {
    const step = {
      name: "cargo build",
      startedAt: "2024-01-01T00:00:00.000Z",
      endedAt: "2024-01-01T00:00:02.000Z",
      durationMs: 2000,
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "error: compile failed",
      stdoutSummary: "",
      stderrSummary: "compile failed",
    };
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [step],
      {},
      [],
    );
    expect(md).toContain("Failure logs");
    expect(md).toContain("cargo build");
    expect(md).toContain("error: compile failed");
  });

  test("renders warnings section", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      {},
      [],
      ["cache miss on first run"],
    );
    expect(md).toContain("⚠️");
    expect(md).toContain("cache miss on first run");
  });

  test("shows (none) when steps list is empty", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      {},
      [],
    );
    expect(md).toContain("(none)");
  });

  test("shows credential keys in table", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      { ...baseInputs, credentials: { CARGO_REGISTRY_TOKEN: true } },
      [],
      {},
      [],
    );
    expect(md).toContain("CARGO_REGISTRY_TOKEN");
  });

  test("shows 'none' when no credentials used", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      { ...baseInputs, credentials: {} },
      [],
      {},
      [],
    );
    expect(md).toContain("none");
  });

  test("renders published version output", () => {
    const md = renderPipelineReportMarkdown(
      baseMetadata,
      baseInputs,
      [],
      { publishedVersion: "1.2.3" },
      [],
    );
    expect(md).toContain("1.2.3");
  });
});
