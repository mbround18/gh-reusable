import { expect, test } from "vitest";
import {
  aggregateAuditResults,
  buildScanFindings,
  createSkippedScannerResult,
  detectLanguageFamilies,
  renderAuditIntelligenceSection,
  selectAuditScanners,
} from "../../dagger-module/src/audit-logic.js";
import type {
  AuditScannerResult,
  TopFinding,
} from "../../dagger-module/src/audit-types.js";

function finding(
  scanner: string,
  severity: TopFinding["severity"],
  rule: string,
  path: string,
  message: string,
  line?: number,
): TopFinding {
  return {
    scanner,
    severity,
    rule,
    path,
    message,
    ...(line ? { line } : {}),
  };
}

function scannerResult(
  name: string,
  status: AuditScannerResult["status"],
  findingsCount: number,
  topFindings: readonly TopFinding[] = [],
): AuditScannerResult {
  return {
    name,
    family: "cross-language",
    status,
    findingsCount,
    durationMs: name === "semgrep" ? 120 : 80,
    topFindings,
    ...(status === "failed" ? { failureReason: `${name} failed` } : {}),
  };
}

test("smart audit detects language families and emits additive scan findings", () => {
  const detection = detectLanguageFamilies({
    "Cargo.toml": true,
    "Cargo.lock": true,
    "package.json": true,
    "pnpm-lock.yaml": true,
    "pyproject.toml": true,
    "uv.lock": true,
  });

  expect(detection.families.map((family) => family.family)).toEqual([
    "rust",
    "node",
    "python",
    "generic",
  ]);
  expect(detection.fallbackMode).toBe(false);
  expect(detection.highConfidenceFamilies).toEqual([
    "rust",
    "node",
    "python",
  ]);

  const summary = aggregateAuditResults(
    [
      scannerResult("semgrep", "findings", 2, [
        finding("semgrep", "high", "rule-a", "src/a.ts", "High issue", 12),
        finding(
          "semgrep",
          "medium",
          "rule-b",
          "src/b.ts",
          "Medium issue",
          8,
        ),
      ]),
      scannerResult("gitleaks", "pass", 0),
    ],
    detection,
  );

  expect(summary.detectedFamilies).toEqual([
    "rust",
    "node",
    "python",
    "generic",
  ]);
  expect(summary.detectionConfidence).toBe("high");
  expect(summary.overallStatus).toBe("findings");
  expect(summary.totalFindings).toBe(2);

  expect(buildScanFindings(summary)).toEqual({
    semgrep: 2,
    gitleaks: 0,
    total: 2,
    detectedFamilyCount: 3,
    fallbackMode: 0,
    scannerFailureCount: 0,
  });
});

test("smart audit isolates scanner failures and ranks failures first", () => {
  const detection = detectLanguageFamilies({
    "Cargo.toml": true,
    "Cargo.lock": true,
  });

  const summary = aggregateAuditResults(
    [
      scannerResult("semgrep", "findings", 2, [
        finding(
          "semgrep",
          "critical",
          "critical-rule",
          "src/secret.ts",
          "Critical issue",
          1,
        ),
        finding(
          "semgrep",
          "medium",
          "medium-rule",
          "src/secret.ts",
          "Medium issue",
          7,
        ),
      ]),
      scannerResult("gitleaks", "failed", 0),
    ],
    detection,
  );

  expect(summary.scanners.map((scanner) => scanner.name)).toEqual([
    "gitleaks",
    "semgrep",
  ]);
  expect(summary.overallStatus).toBe("degraded");
  expect(summary.topFindings.map((finding) => finding.severity)).toEqual([
    "critical",
    "medium",
  ]);
  expect(buildScanFindings(summary)).toEqual({
    semgrep: 2,
    gitleaks: 0,
    total: 2,
    detectedFamilyCount: 1,
    fallbackMode: 0,
    scannerFailureCount: 1,
  });

  const markdown = renderAuditIntelligenceSection(summary);
  expect(markdown).toContain("### Audit Intelligence");
  expect(markdown).toContain("`degraded`");
  expect(markdown.indexOf("CRITICAL")).toBeLessThan(markdown.indexOf("MEDIUM"));
});

test("smart audit falls back safely when language detection is weak", () => {
  const detection = detectLanguageFamilies({});
  const scanners = selectAuditScanners(detection, false);
  const semgrep = scanners.find((scanner) => scanner.name === "semgrep");
  const gitleaks = scanners.find((scanner) => scanner.name === "gitleaks");

  expect(semgrep?.shouldRun).toBe(true);
  expect(gitleaks?.shouldRun).toBe(false);

  const summary = aggregateAuditResults(
    [
      scannerResult("semgrep", "pass", 0),
      createSkippedScannerResult(gitleaks!),
    ],
    detection,
  );

  expect(summary.detectedFamilies).toEqual(["generic"]);
  expect(summary.detectionConfidence).toBe("none");
  expect(summary.fallbackMode).toBe(true);
  expect(summary.overallStatus).toBe("pass");
  expect(summary.scanners.map((scanner) => scanner.status)).toEqual([
    "pass",
    "skipped",
  ]);

  const markdown = renderAuditIntelligenceSection(summary);
  expect(markdown).toContain("⚠️ Fallback mode was used");
  expect(markdown).toContain("`skipped`");
  expect(buildScanFindings(summary)).toEqual({
    semgrep: 0,
    gitleaks: 0,
    total: 0,
    detectedFamilyCount: 0,
    fallbackMode: 1,
    scannerFailureCount: 0,
  });
});
