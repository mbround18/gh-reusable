# Data Model: Smart Audit Pipeline

## Overview

This document describes all new and modified types introduced by the Smart Audit Pipeline feature. All new types live in `packages/dagger-module/src/audit-types.ts`. Existing types in `reporting.ts` and `types.ts` receive additive-only changes.

---

## New File: `packages/dagger-module/src/audit-types.ts`

### `LanguageFamily`

The set of language families the detection engine recognizes.

```typescript
export type LanguageFamily =
  | "rust"
  | "node"
  | "python"
  | "go"
  | "docker"
  | "generic"; // always-present baseline
```

- `generic` is always emitted (ensures semgrep + gitleaks always run).
- Additional families are detected from repository signals.

---

### `DetectionConfidence`

How certain the detection engine is about a family's presence.

```typescript
export type DetectionConfidence = "high" | "medium" | "low" | "none";
```

- `high`: two or more corroborating signals (e.g. `Cargo.toml` + `Cargo.lock`).
- `medium`: one strong signal (e.g. `package.json` without lockfile).
- `low`: only weak or indirect signals (e.g. `.rs` files but no manifest).
- `none`: no signals found — used internally, not emitted in results.

---

### `DetectedFamily`

One detected language family with its evidence trail.

```typescript
export interface DetectedFamily {
  readonly family: LanguageFamily;
  readonly confidence: DetectionConfidence;
  readonly signals: readonly string[]; // files that triggered detection
}
```

**Validation rules**:

- `signals` must be non-empty for any family with confidence > `none`.
- `generic` always has `confidence: "high"` and `signals: ["(baseline)"]`.

---

### `DetectionResult`

The aggregated output of the language detection phase.

```typescript
export interface DetectionResult {
  readonly families: readonly DetectedFamily[];
  readonly fallbackMode: boolean;
  readonly highConfidenceFamilies: readonly LanguageFamily[];
}
```

- `fallbackMode`: `true` when no family other than `generic` reached `medium`+ confidence.
- `highConfidenceFamilies`: convenience subset of families at `high` confidence.

---

### `ScannerStatus`

The execution/result status of a single scanner run.

```typescript
export type ScannerStatus =
  | "pass" // scanner ran, zero findings
  | "findings" // scanner ran, one or more findings returned
  | "failed" // scanner container threw / non-zero exit and unrecoverable
  | "skipped"; // scanner excluded because no matching family detected
```

- `skipped` is surfaced in the final audit intelligence table for scanners that were intentionally not run.

---

### `TopFinding`

A single normalized finding extracted from any scanner's output, used for the "most actionable failures first" ordering in the final report.

```typescript
export interface TopFinding {
  readonly rule: string;
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly path: string;
  readonly line?: number;
  readonly message: string;
  readonly scanner: string; // originating scanner name
}
```

**Severity ordering** (for report sort): `critical > high > medium > low > info`.

---

### `AuditScannerResult`

The outcome of one scanner execution, including timing and top findings.

```typescript
export interface AuditScannerResult {
  readonly name: string; // e.g. "semgrep", "gitleaks"
  readonly family: LanguageFamily | "cross-language";
  readonly status: ScannerStatus;
  readonly findingsCount: number;
  readonly durationMs: number;
  readonly failureReason?: string; // present when status === "failed"
  readonly topFindings: readonly TopFinding[];
}
```

---

### `AuditOverallStatus`

The rolled-up status of the entire audit run.

```typescript
export type AuditOverallStatus =
  | "pass" // all scanners ran, zero findings
  | "findings" // all scanners ran, one or more findings
  | "degraded" // one or more scanners failed, remaining results preserved
  | "failed"; // all scanners failed or detection produced no runnable scanners
```

**Derivation rules**:

1. Start with `pass`.
2. If any scanner has `status === "findings"` → `findings`.
3. If any scanner has `status === "failed"` → `degraded` (unless all failed → `failed`).
4. `degraded` supersedes `pass`; `findings` and `degraded` can coexist (show both).

---

### `AuditSummary`

The top-level smart audit summary embedded in `PipelineReportOutputs`.

```typescript
export interface AuditSummary {
  readonly overallStatus: AuditOverallStatus;
  readonly detectedFamilies: readonly string[]; // family names only
  readonly detectionConfidence: DetectionConfidence; // lowest confidence across families
  readonly fallbackMode: boolean;
  readonly scanners: readonly AuditScannerResult[];
  readonly totalFindings: number;
  readonly topFindings: readonly TopFinding[]; // merged, severity-sorted, capped at 10
}
```

---

## Modified: `packages/dagger-module/src/reporting.ts`

### `PipelineReportOutputs` (additive change)

Add one optional field:

```typescript
// Before (existing):
export interface PipelineReportOutputs {
  // ...existing fields...
  readonly scanFindings?: Readonly<Record<string, number>>;
}

// After (new field added):
export interface PipelineReportOutputs {
  // ...existing fields unchanged...
  readonly scanFindings?: Readonly<Record<string, number>>;
  readonly auditSummary?: AuditSummary; // NEW — imported from audit-types.ts
}
```

**Backwards compat**: The field is optional. Existing non-audit pipelines never set it and existing report consumers that only read `scanFindings` are unaffected.

### `scanFindings` key additions

The `audit` function will write the following numeric keys to `scanFindings` (all pre-existing keys preserved):

| Key                   | Value description                             |
| --------------------- | --------------------------------------------- |
| `semgrep`             | (existing) semgrep finding count              |
| `gitleaks`            | (existing) gitleaks finding count             |
| `total`               | (existing) sum of all findings                |
| `detectedFamilyCount` | (new) number of detected families             |
| `fallbackMode`        | (new) `1` if fallback active, else `0`        |
| `scannerFailureCount` | (new) number of scanners with `failed` status |

---

## State Transitions

### Audit Function Execution Flow

```
[START]
  │
  ▼
detectLanguageFamilies(source)
  │
  ├─ families: []          → fallbackMode=true, families=["generic"]
  └─ families: [rust, node, generic]
  │
  ▼
selectScanners(families)   → ScannerConfig[]
  │
  ▼
Promise.allSettled([scanner1(), scanner2(), ...])
  │
  ├─ fulfilled → AuditScannerResult (status: pass|findings)
  └─ rejected  → AuditScannerResult (status: failed, failureReason)
  │
  ▼
aggregateResults(settledResults)  → AuditSummary
  │
  ▼
reporter.setOutput("auditSummary", summary)
reporter.setOutput("scanFindings", { ...existing, ...newKeys })
  │
  ▼
report = reporter.finalize()
appendAuditIntelligenceSection(report.markdown, summary) → enrichedMarkdown
  │
  ▼
return JSON.stringify({ markdown: enrichedMarkdown, report, reportJson, reportMarkdown: enrichedMarkdown })
  │
[END]
```

---

## Detection Signal Table

| Family    | Signal file(s)                                                            | Confidence |
| --------- | ------------------------------------------------------------------------- | ---------- |
| `rust`    | `Cargo.toml` + `Cargo.lock`                                               | high       |
| `rust`    | `Cargo.toml` (no lock)                                                    | medium     |
| `node`    | `package.json` + (`pnpm-lock.yaml` or `yarn.lock` or `package-lock.json`) | high       |
| `node`    | `package.json` alone                                                      | medium     |
| `python`  | `pyproject.toml` + (`uv.lock` or `poetry.lock`)                           | high       |
| `python`  | `pyproject.toml` alone or `requirements.txt`                              | medium     |
| `python`  | `setup.py` only                                                           | low        |
| `go`      | `go.mod` + `go.sum`                                                       | high       |
| `go`      | `go.mod` alone                                                            | medium     |
| `docker`  | `Dockerfile`                                                              | high       |
| `docker`  | `docker-compose.yml` (no Dockerfile)                                      | medium     |
| `generic` | (always present)                                                          | high       |

---

## Scanner Registry (Initial)

| Scanner    | Family           | Image                          | Scope                                          |
| ---------- | ---------------- | ------------------------------ | ---------------------------------------------- |
| `semgrep`  | `cross-language` | `returntocorp/semgrep:1.81.0`  | All families; uses `semgrepConfig`             |
| `gitleaks` | `cross-language` | `zricethezav/gitleaks:v8.24.2` | All families; conditional on `includeGitleaks` |

> **Note**: The registry is intentionally small for v1. The architecture allows adding family-scoped scanners (e.g. `cargo audit` for `rust`, `npm audit` for `node`) in subsequent iterations without changing the `audit` function signature.
