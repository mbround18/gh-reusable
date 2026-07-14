/**
 * Structured envelope emitted by the Dagger module's PipelineReporter.
 * See packages/dagger-module/src/reporting.ts for the producer side.
 */
export interface ParsedDaggerReport {
  readonly markdown: string;
  readonly successValue?: boolean;
  readonly failed: boolean;
  /** True when raw stdout could not be parsed as JSON but looked like a failure. */
  readonly failClosed: boolean;
}

export function parseDaggerStdout(raw: string): ParsedDaggerReport | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = parseJsonEnvelope(trimmed);
  if (parsed === undefined) {
    if (/"success"\s*:\s*false/.test(trimmed)) {
      return { markdown: "", failed: true, failClosed: true };
    }
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const envelope = parsed as Record<string, unknown>;
  const report =
    envelope.report && typeof envelope.report === "object"
      ? (envelope.report as Record<string, unknown>)
      : envelope;

  const markdown =
    firstNonEmptyString(envelope.reportMarkdown) ||
    firstNonEmptyString(envelope.markdown) ||
    firstNonEmptyString(report.markdown) ||
    "";

  const errors = Array.isArray(report.errors)
    ? report.errors
    : Array.isArray(envelope.errors)
      ? envelope.errors
      : [];

  const successValue =
    typeof envelope.success === "boolean"
      ? envelope.success
      : typeof report.success === "boolean"
        ? report.success
        : undefined;

  const failed = successValue === false || errors.length > 0;

  return { markdown, successValue, failed, failClosed: false };
}

function parseJsonEnvelope(trimmed: string): unknown {
  const tryParse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return undefined;
}

function firstNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function stripMarkdownEmphasis(value: string): string {
  return value.replace(/\*\*(.*?)\*\*/g, "$1");
}

export interface ConsoleSegment {
  readonly type: "text" | "group";
  readonly label?: string;
  readonly body: string;
}

const COLLAPSIBLE_BLOCK =
  /<details>\s*<summary>(.*?)<\/summary>\s*<pre>([\s\S]*?)<\/pre>\s*<\/details>/g;

/**
 * Splits report markdown into plain-text segments and collapsible
 * "<details><pre>" blocks so the caller can render each appropriately —
 * plain text for the log, and GitHub Actions log-group folding for the
 * collapsible blocks (rendered as <details> in the Job Summary instead).
 */
export function toConsoleSegments(markdown: string): readonly ConsoleSegment[] {
  const segments: ConsoleSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(COLLAPSIBLE_BLOCK)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", body: markdown.slice(lastIndex, index) });
    }
    segments.push({ type: "group", label: match[1], body: match[2].trim() });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "text", body: markdown.slice(lastIndex) });
  }

  return segments;
}

export function renderConsoleText(segment: ConsoleSegment): string {
  return stripMarkdownEmphasis(decodeHtmlEntities(segment.body)).trim();
}

export function renderConsoleGroupBody(segment: ConsoleSegment): string {
  return decodeHtmlEntities(segment.body);
}
