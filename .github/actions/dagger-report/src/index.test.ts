import { afterEach, describe, expect, test, vi } from "vitest";

const mockGetInput = vi.fn<(name: string) => string>();
const mockSetOutput = vi.fn<(name: string, value: string) => void>();
const mockSetFailed = vi.fn<(message: string) => void>();
const mockInfo = vi.fn<(message: string) => void>();
const mockStartGroup = vi.fn<(name: string) => void>();
const mockEndGroup = vi.fn<() => void>();
const mockAddRaw = vi.fn<(text: string) => void>();
const mockSummaryWrite = vi.fn<() => Promise<void>>();

vi.mock("@actions/core", () => {
  const summary = {
    addRaw: (text: string) => {
      mockAddRaw(text);
      return summary;
    },
    write: () => mockSummaryWrite(),
  };

  return {
    getInput: (name: string) => mockGetInput(name),
    setOutput: (name: string, value: string) => mockSetOutput(name, value),
    setFailed: (message: string) => mockSetFailed(message),
    info: (message: string) => mockInfo(message),
    startGroup: (name: string) => mockStartGroup(name),
    endGroup: () => mockEndGroup(),
    summary,
  };
});

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  mockGetInput.mockReset();
  mockSetOutput.mockReset();
  mockSetFailed.mockReset();
  mockInfo.mockReset();
  mockStartGroup.mockReset();
  mockEndGroup.mockReset();
  mockAddRaw.mockReset();
  mockSummaryWrite.mockReset();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("dagger-report entrypoint", () => {
  test("clears outputs and does nothing for empty stdout", async () => {
    mockGetInput.mockImplementation((name) => (name === "dagger-stdout" ? "" : ""));

    await import("./index.js");
    await vi.waitFor(() => expect(mockSetOutput).toHaveBeenCalled());

    expect(mockSetOutput).toHaveBeenCalledWith("report-markdown", "");
    expect(mockSetOutput).toHaveBeenCalledWith("pipeline-success", "");
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("writes the summary and folds failure logs into groups on failure", async () => {
    const markdown = [
      "❌ **rust / Pipeline**",
      "",
      "<details><summary>stdout</summary>",
      "",
      "<pre>Diff in /src/main.rs:255:\n-old\n+new</pre>",
      "</details>",
    ].join("\n");
    const raw = JSON.stringify({
      success: false,
      reportMarkdown: markdown,
      report: { errors: [{ step: "cargo fmt" }] },
    });
    mockGetInput.mockImplementation((name) => (name === "dagger-stdout" ? raw : ""));

    await import("./index.js");
    await vi.waitFor(() => expect(mockSetFailed).toHaveBeenCalled());

    expect(mockSetOutput).toHaveBeenCalledWith("report-markdown", markdown);
    expect(mockSetOutput).toHaveBeenCalledWith("pipeline-success", "false");
    expect(mockStartGroup).toHaveBeenCalledWith("stdout");
    expect(mockEndGroup).toHaveBeenCalled();
    expect(mockAddRaw).toHaveBeenCalledWith(`\n${markdown}\n`);
    expect(mockSummaryWrite).toHaveBeenCalled();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Structured Dagger output returned success=false or included report errors.",
    );
  });

  test("fails closed for unparsable stdout that looks like a failure", async () => {
    const raw = 'dagger output: {"success":false missing-closing-brace';
    mockGetInput.mockImplementation((name) => (name === "dagger-stdout" ? raw : ""));

    await import("./index.js");
    await vi.waitFor(() => expect(mockSetFailed).toHaveBeenCalled());

    expect(mockSetOutput).toHaveBeenCalledWith("report-markdown", "");
    expect(mockSetOutput).toHaveBeenCalledWith("pipeline-success", "");
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Raw Dagger stdout indicates success=false, but structured JSON could not be parsed.",
    );
    expect(mockAddRaw).not.toHaveBeenCalled();
  });

  test("falls back to DAGGER_STDOUT env var when input is unset", async () => {
    process.env.DAGGER_STDOUT = JSON.stringify({
      success: true,
      reportMarkdown: "✅ all good",
      report: { errors: [] },
    });
    mockGetInput.mockReturnValue("");

    await import("./index.js");
    await vi.waitFor(() => expect(mockSetFailed).not.toHaveBeenCalled());

    expect(mockSetOutput).toHaveBeenCalledWith("report-markdown", "✅ all good");
    expect(mockSetOutput).toHaveBeenCalledWith("pipeline-success", "true");
  });
});
