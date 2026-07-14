export type LanguageFamily =
  "rust" | "node" | "python" | "go" | "docker" | "generic";

export type DetectionConfidence = "high" | "medium" | "low" | "none";

export interface DetectedFamily {
  readonly family: LanguageFamily;
  readonly confidence: DetectionConfidence;
  readonly signals: readonly string[];
}

export interface DetectionResult {
  readonly families: readonly DetectedFamily[];
  readonly fallbackMode: boolean;
  readonly highConfidenceFamilies: readonly LanguageFamily[];
}

export type ScannerStatus = "pass" | "findings" | "failed" | "skipped";

export interface TopFinding {
  readonly rule: string;
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly path: string;
  readonly line?: number;
  readonly message: string;
  readonly scanner: string;
}

export interface AuditScannerResult {
  readonly name: string;
  readonly family: LanguageFamily | "cross-language";
  readonly status: ScannerStatus;
  readonly findingsCount: number;
  readonly durationMs: number;
  readonly failureReason?: string;
  readonly topFindings: readonly TopFinding[];
}

export type AuditOverallStatus = "pass" | "findings" | "degraded" | "failed";

export interface AuditSummary {
  readonly overallStatus: AuditOverallStatus;
  readonly detectedFamilies: readonly string[];
  readonly detectionConfidence: DetectionConfidence;
  readonly fallbackMode: boolean;
  readonly scanners: readonly AuditScannerResult[];
  readonly totalFindings: number;
  readonly topFindings: readonly TopFinding[];
}

export interface ScannerConfig {
  readonly name: "semgrep" | "gitleaks";
  readonly family: LanguageFamily | "cross-language";
  readonly appliesTo: readonly LanguageFamily[];
  readonly shouldRun: boolean;
  readonly stepName: string;
  readonly image: string;
}

export type RepositorySignals = Readonly<Record<string, boolean>>;
