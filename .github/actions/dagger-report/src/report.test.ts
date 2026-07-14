import { describe, expect, test } from "vitest";

import {
  decodeHtmlEntities,
  parseDaggerStdout,
  toConsoleSegments,
} from "./report.js";

describe("parseDaggerStdout", () => {
  test("returns undefined for empty stdout", () => {
    expect(parseDaggerStdout("")).toBeUndefined();
    expect(parseDaggerStdout("   \n")).toBeUndefined();
  });

  test("ignores plain non-JSON stdout", () => {
    expect(parseDaggerStdout("plain unstructured stdout")).toBeUndefined();
  });

  test("parses structured success payloads", () => {
    const raw = JSON.stringify({
      success: true,
      reportMarkdown: "✅ all good",
      report: { errors: [] },
    });

    expect(parseDaggerStdout(raw)).toEqual({
      markdown: "✅ all good",
      successValue: true,
      failed: false,
      failClosed: false,
    });
  });

  test("parses structured failure payloads", () => {
    const raw = JSON.stringify({
      success: false,
      reportMarkdown: "❌ failed report",
      report: { errors: [{ step: "rust-build-and-test" }] },
    });

    const result = parseDaggerStdout(raw);
    expect(result?.markdown).toBe("❌ failed report");
    expect(result?.successValue).toBe(false);
    expect(result?.failed).toBe(true);
    expect(result?.failClosed).toBe(false);
  });

  test("extracts a JSON envelope from noisy stdout wrappers", () => {
    const payload = JSON.stringify({
      success: false,
      report: { markdown: "❌ noisy wrapper failure", errors: [] },
    });
    const raw = `prefix log line\n${payload}\nsuffix log line`;

    const result = parseDaggerStdout(raw);
    expect(result?.markdown).toBe("❌ noisy wrapper failure");
    expect(result?.successValue).toBe(false);
    expect(result?.failed).toBe(true);
  });

  test('fails closed for unparsable stdout containing "success":false', () => {
    const raw = 'dagger output: {"success":false missing-closing-brace';

    expect(parseDaggerStdout(raw)).toEqual({
      markdown: "",
      failed: true,
      failClosed: true,
    });
  });

  test("prefers reportMarkdown over markdown over report.markdown", () => {
    const raw = JSON.stringify({
      success: true,
      reportMarkdown: "top-level reportMarkdown",
      markdown: "top-level markdown",
      report: { markdown: "nested markdown" },
    });

    expect(parseDaggerStdout(raw)?.markdown).toBe("top-level reportMarkdown");
  });

  test("treats a non-empty report.errors array as failed even without success:false", () => {
    const raw = JSON.stringify({
      report: { markdown: "partial failure", errors: [{ step: "audit" }] },
    });

    const result = parseDaggerStdout(raw);
    expect(result?.failed).toBe(true);
    expect(result?.successValue).toBeUndefined();
  });
});

describe("decodeHtmlEntities", () => {
  test("decodes the entities escapeHtml produces", () => {
    expect(decodeHtmlEntities("&lt;a&gt; &quot;b&quot; &#39;c&#39; &amp;")).toBe(
      `<a> "b" 'c' &`,
    );
  });
});

describe("toConsoleSegments", () => {
  test("splits collapsible details/pre blocks from surrounding text", () => {
    const markdown = [
      "- ❌ **cargo fmt** (exit 1)",
      "<details><summary>stdout</summary>",
      "",
      "<pre>Diff in /src/main.rs:255:\n-old\n+new</pre>",
      "</details>",
    ].join("\n");

    const segments = toConsoleSegments(markdown);

    expect(segments[0]).toMatchObject({
      type: "text",
      body: "- ❌ **cargo fmt** (exit 1)\n",
    });
    expect(segments[1]).toMatchObject({
      type: "group",
      label: "stdout",
      body: "Diff in /src/main.rs:255:\n-old\n+new",
    });
  });

  test("returns a single text segment when there are no collapsible blocks", () => {
    const markdown = "### Steps\n- ✅ **cargo build** (10ms)";

    expect(toConsoleSegments(markdown)).toEqual([
      { type: "text", body: markdown },
    ]);
  });
});
