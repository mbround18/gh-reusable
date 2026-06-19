import type {
  AuditOverallStatus,
  AuditScannerResult,
  AuditSummary,
  DetectionConfidence,
  DetectionResult,
  DetectedFamily,
  LanguageFamily,
  RepositorySignals,
  ScannerConfig,
  ScannerStatus,
  TopFinding,
} from "./audit-types";

const LANGUAGE_FAMILIES: readonly LanguageFamily[] = [
  "rust",
  "node",
  "python",
  "go",
  "docker",
];

const CONFIDENCE_RANK: Record<DetectionConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const SEVERITY_RANK: Record<TopFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const AUDIT_SCANNER_REGISTRY: readonly Omit<ScannerConfig, "shouldRun">[] = [
  {
    name: "semgrep",
    family: "cross-language",
    appliesTo: ["rust", "node", "python", "go", "docker"],
    stepName: "semgrep scan",
    image: "returntocorp/semgrep:1.81.0",
  },
  {
    name: "gitleaks",
    family: "cross-language",
    appliesTo: ["rust", "node", "python", "go", "docker"],
    stepName: "gitleaks detect",
    image: "zricethezav/gitleaks:v8.24.2",
  },
];

export function detectLanguageFamilies(
  signals: RepositorySignals,
): DetectionResult {
  const families: DetectedFamily[] = [];

  for (const family of LANGUAGE_FAMILIES) {
    const detected = detectFamily(signals, family);
    if (detected.confidence !== "none") {
      families.push(detected);
    }
  }

  families.push({
    family: "generic",
    confidence: "high",
    signals: ["(baseline)"],
  });

  const nonGenericFamilies = families.filter(
    (family) => family.family !== "generic",
  );
  const fallbackMode = !nonGenericFamilies.some(
    (family) => CONFIDENCE_RANK[family.confidence] >= CONFIDENCE_RANK.medium,
  );
  const highConfidenceFamilies = nonGenericFamilies
    .filter((family) => family.confidence === "high")
    .map((family) => family.family);

  return {
    families,
    fallbackMode,
    highConfidenceFamilies,
  };
}

export function selectAuditScanners(
  detection: DetectionResult,
  includeGitleaks: boolean,
): readonly ScannerConfig[] {
  const detectedFamilies = new Set(
    detection.families.map((family) => family.family),
  );

  return AUDIT_SCANNER_REGISTRY.map((scanner) => ({
    ...scanner,
    shouldRun:
      (scanner.name !== "gitleaks" || includeGitleaks) &&
      (scanner.family === "cross-language" ||
        scanner.appliesTo.some((family) => detectedFamilies.has(family))),
  }));
}

export function createSkippedScannerResult(
  scanner: ScannerConfig,
): AuditScannerResult {
  return {
    name: scanner.name,
    family: scanner.family,
    status: "skipped",
    findingsCount: 0,
    durationMs: 0,
    topFindings: [],
  };
}

export function createFailedScannerResult(
  scanner: ScannerConfig,
  durationMs: number,
  failureReason: string,
): AuditScannerResult {
  return {
    name: scanner.name,
    family: scanner.family,
    status: "failed",
    findingsCount: 0,
    durationMs,
    failureReason,
    topFindings: [],
  };
}

export function aggregateAuditResults(
  scannerResults: readonly AuditScannerResult[],
  detection: DetectionResult,
): AuditSummary {
  const scanners = sortScannerResults(scannerResults);
  const runnableScanners = scanners.filter(
    (scanner) => scanner.status !== "skipped",
  );
  const findingCount = runnableScanners.reduce((total, scanner) => {
    if (scanner.status === "findings" || scanner.status === "pass") {
      return total + scanner.findingsCount;
    }
    return total;
  }, 0);
  const topFindings = runnableScanners
    .flatMap((scanner) => scanner.topFindings)
    .sort(compareTopFindings)
    .slice(0, 10);

  return {
    overallStatus: deriveOverallStatus(runnableScanners),
    detectedFamilies: detection.families.map((family) => family.family),
    detectionConfidence: deriveDetectionConfidence(detection),
    fallbackMode: detection.fallbackMode,
    scanners,
    totalFindings: findingCount,
    topFindings,
  };
}

export function buildScanFindings(
  summary: AuditSummary,
): Readonly<Record<string, number>> {
  const scannersByName = new Map(
    summary.scanners.map((scanner) => [scanner.name, scanner] as const),
  );

  return {
    semgrep: scannersByName.get("semgrep")?.findingsCount ?? 0,
    gitleaks: scannersByName.get("gitleaks")?.findingsCount ?? 0,
    total: summary.totalFindings,
    detectedFamilyCount: summary.detectedFamilies.filter(
      (family) => family !== "generic",
    ).length,
    fallbackMode: summary.fallbackMode ? 1 : 0,
    scannerFailureCount: summary.scanners.filter(
      (scanner) => scanner.status === "failed",
    ).length,
  };
}

export function renderAuditIntelligenceSection(summary: AuditSummary): string {
  const families = summary.detectedFamilies
    .map((family) => (family === "generic" ? "generic (baseline)" : family))
    .join(", ");
  const scannerRows = summary.scanners
    .map((scanner) => {
      const icon = statusIcon(scanner.status);
      return `| ${scanner.name} | ${icon} \`${scanner.status}\` | ${scanner.findingsCount} | ${scanner.durationMs} | ${scanner.family} |`;
    })
    .join("\n");
  const topFindings =
    summary.topFindings.length > 0
      ? summary.topFindings
          .map((finding, index) => {
            const line = finding.line ? `:${finding.line}` : "";
            return `${index + 1}. **${finding.severity.toUpperCase()}** \`${finding.scanner}\` · \`${finding.rule}\` · \`${finding.path}${line}\` — ${finding.message}`;
          })
          .join("\n")
      : "- (none)";

  return [
    "### Audit Intelligence",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Overall status | \`${summary.overallStatus}\` |`,
    `| Detection confidence | \`${summary.detectionConfidence}\` |`,
    `| Detected families | ${families ? `\`${families}\`` : "_(none)_"} |`,
    `| Fallback mode | \`${summary.fallbackMode}\` |`,
    `| Scanner failures | \`${summary.scanners.filter((scanner) => scanner.status === "failed").length}\` |`,
    "",
    "#### Scanners",
    "",
    "| Scanner | Status | Findings | Duration (ms) | Family |",
    "| --- | --- | --- | --- | --- |",
    scannerRows || "| _(none)_ | `skipped` | `0` | `0` | _(none)_ |",
    "",
    "#### Top findings",
    "",
    topFindings,
    ...(summary.fallbackMode
      ? [
          "",
          "> ⚠️ Fallback mode was used because repository language detection was weak or ambiguous.",
        ]
      : []),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function parseScannerFindings(
  scanner: "semgrep" | "gitleaks",
  rawJson: string,
): Pick<AuditScannerResult, "findingsCount" | "topFindings"> {
  if (scanner === "semgrep") {
    return parseSemgrepFindings(rawJson);
  }
  return parseGitleaksFindings(rawJson);
}

export function normalizeScannerStatus(
  exitCode: number | undefined,
  findingsCount: number,
): Exclude<ScannerStatus, "skipped"> {
  if (exitCode === 0) {
    return findingsCount > 0 ? "findings" : "pass";
  }
  return findingsCount > 0 ? "findings" : "failed";
}

function detectFamily(
  signals: RepositorySignals,
  family: LanguageFamily,
): DetectedFamily {
  switch (family) {
    case "rust":
      return detectWithSignals(
        family,
        signals,
        [
          ["Cargo.toml", "medium"],
          ["Cargo.lock", "low"],
        ],
        [["Cargo.toml", "Cargo.lock"]],
      );
    case "node":
      return detectWithSignals(
        family,
        signals,
        [
          ["package.json", "medium"],
          ["pnpm-lock.yaml", "low"],
          ["yarn.lock", "low"],
          ["package-lock.json", "low"],
        ],
        [
          ["package.json", "pnpm-lock.yaml"],
          ["package.json", "yarn.lock"],
          ["package.json", "package-lock.json"],
        ],
      );
    case "python":
      return detectWithSignals(
        family,
        signals,
        [
          ["pyproject.toml", "medium"],
          ["uv.lock", "low"],
          ["poetry.lock", "low"],
          ["requirements.txt", "medium"],
          ["setup.py", "low"],
        ],
        [
          ["pyproject.toml", "uv.lock"],
          ["pyproject.toml", "poetry.lock"],
        ],
      );
    case "go":
      return detectWithSignals(
        family,
        signals,
        [
          ["go.mod", "medium"],
          ["go.sum", "low"],
        ],
        [["go.mod", "go.sum"]],
      );
    case "docker":
      return detectWithSignals(
        family,
        signals,
        [
          ["Dockerfile", "high"],
          ["docker-compose.yml", "medium"],
          ["docker-compose.yaml", "medium"],
          ["compose.yml", "medium"],
          ["compose.yaml", "medium"],
        ],
        [["Dockerfile"]],
      );
    case "generic":
      return {
        family: "generic",
        confidence: "high",
        signals: ["(baseline)"],
      };
  }
}

function detectWithSignals(
  family: LanguageFamily,
  signals: RepositorySignals,
  entries: readonly [string, Exclude<DetectionConfidence, "none">][],
  highConfidenceCombos: readonly (readonly string[])[],
): DetectedFamily {
  const present = entries.filter(([signal]) => signals[signal]);
  if (present.length === 0) {
    return { family, confidence: "none", signals: [] };
  }

  const hasHighSignal = highConfidenceCombos.some((combo) =>
    combo.every((signal) => signals[signal]),
  );
  const confidence = hasHighSignal
    ? "high"
    : present.some(([, confidence]) => confidence === "medium")
      ? "medium"
      : "low";

  return {
    family,
    confidence,
    signals: present.map(([signal]) => signal),
  };
}

function deriveDetectionConfidence(
  detection: DetectionResult,
): DetectionConfidence {
  const nonGeneric = detection.families.filter(
    (family) => family.family !== "generic",
  );
  if (nonGeneric.length === 0) {
    return "none";
  }

  let lowest: DetectionConfidence = "high";
  for (const family of nonGeneric) {
    if (CONFIDENCE_RANK[family.confidence] < CONFIDENCE_RANK[lowest]) {
      lowest = family.confidence;
    }
  }
  return lowest;
}

function deriveOverallStatus(
  scanners: readonly AuditScannerResult[],
): AuditOverallStatus {
  if (scanners.length === 0) {
    return "failed";
  }

  const failed = scanners.filter((scanner) => scanner.status === "failed");
  const findings = scanners.some((scanner) => scanner.status === "findings");
  if (failed.length === scanners.length) {
    return "failed";
  }
  if (failed.length > 0) {
    return "degraded";
  }
  return findings ? "findings" : "pass";
}

function sortScannerResults(
  scanners: readonly AuditScannerResult[],
): AuditScannerResult[] {
  return [...scanners].sort((left, right) => {
    const statusRank =
      scannerStatusRank(left.status) - scannerStatusRank(right.status);
    if (statusRank !== 0) {
      return statusRank;
    }
    if (right.findingsCount !== left.findingsCount) {
      return right.findingsCount - left.findingsCount;
    }
    return left.name.localeCompare(right.name);
  });
}

function scannerStatusRank(status: ScannerStatus): number {
  switch (status) {
    case "failed":
      return 0;
    case "findings":
      return 1;
    case "pass":
      return 2;
    case "skipped":
      return 3;
  }
}

function compareTopFindings(left: TopFinding, right: TopFinding): number {
  const severityDelta =
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }
  const scannerDelta = left.scanner.localeCompare(right.scanner);
  if (scannerDelta !== 0) {
    return scannerDelta;
  }
  const pathDelta = left.path.localeCompare(right.path);
  if (pathDelta !== 0) {
    return pathDelta;
  }
  return (left.line ?? 0) - (right.line ?? 0);
}

function statusIcon(status: ScannerStatus): string {
  switch (status) {
    case "pass":
      return "✅";
    case "findings":
      return "⚠️";
    case "failed":
      return "❌";
    case "skipped":
      return "⏭️";
  }
}

function parseSemgrepFindings(
  rawJson: string,
): Pick<AuditScannerResult, "findingsCount" | "topFindings"> {
  const parsed = safeParseJson(rawJson);
  const results = Array.isArray((parsed as { results?: unknown }).results)
    ? ((parsed as { results: unknown[] }).results ?? [])
    : [];
  const topFindings = results
    .map((result) => normalizeSemgrepFinding(result))
    .filter((finding): finding is TopFinding => finding !== null)
    .sort(compareTopFindings)
    .slice(0, 10);

  return {
    findingsCount: results.length,
    topFindings,
  };
}

function parseGitleaksFindings(
  rawJson: string,
): Pick<AuditScannerResult, "findingsCount" | "topFindings"> {
  const parsed = safeParseJson(rawJson);
  const results = Array.isArray(parsed) ? parsed : [];
  const topFindings = results
    .map((result) => normalizeGitleaksFinding(result))
    .filter((finding): finding is TopFinding => finding !== null)
    .sort(compareTopFindings)
    .slice(0, 10);

  return {
    findingsCount: results.length,
    topFindings,
  };
}

function normalizeSemgrepFinding(value: unknown): TopFinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const extra = isRecord(record.extra) ? record.extra : {};
  const start = isRecord(record.start) ? record.start : {};
  const path = stringValue(record.path) || stringValue(extra.path) || "";
  if (!path) {
    return null;
  }

  return {
    rule:
      stringValue(record.check_id) ||
      stringValue(extra.check_id) ||
      "semgrep-rule",
    severity: normalizeSeverity(
      stringValue(extra.severity) || stringValue(record.severity),
    ),
    path,
    line: numberValue(start.line) || numberValue(record.line),
    message:
      stringValue(extra.message) ||
      stringValue(record.message) ||
      "Semgrep finding",
    scanner: "semgrep",
  };
}

function normalizeGitleaksFinding(value: unknown): TopFinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const path =
    stringValue(record.File) ||
    stringValue(record.file) ||
    stringValue(record.Path) ||
    "";
  if (!path) {
    return null;
  }

  return {
    rule:
      stringValue(record.RuleID) ||
      stringValue(record.ruleID) ||
      stringValue(record.rule_id) ||
      "gitleaks-rule",
    severity: normalizeSeverity(
      stringValue(record.Severity) || stringValue(record.severity) || "high",
    ),
    path,
    line:
      numberValue(record.StartLine) ||
      numberValue(record.startLine) ||
      numberValue(record.Line) ||
      numberValue(record.line),
    message:
      stringValue(record.Description) ||
      stringValue(record.description) ||
      stringValue(record.Message) ||
      stringValue(record.message) ||
      "Gitleaks finding",
    scanner: "gitleaks",
  };
}

function normalizeSeverity(value: string | undefined): TopFinding["severity"] {
  switch ((value ?? "").toLowerCase()) {
    case "critical":
    case "error":
      return "critical";
    case "high":
      return "high";
    case "medium":
    case "moderate":
      return "medium";
    case "low":
      return "low";
    default:
      return "info";
  }
}

function safeParseJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
