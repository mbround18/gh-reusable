# Implementation Plan: Smart Audit Pipeline

## Inputs

- Linked feature spec: `specs/001-smart-audit-pipeline/spec.md`
- Research: `specs/001-smart-audit-pipeline/research.md`
- Data model: `specs/001-smart-audit-pipeline/data-model.md`
- Contract: `specs/001-smart-audit-pipeline/contracts/audit-function.md`
- Quickstart: `specs/001-smart-audit-pipeline/quickstart.md`
- Affected paths:
  - `.github/workflows/audit.yaml` — **no changes required** (backwards compat preserved)
  - `packages/dagger-module/src/index.ts` — extend `audit` @func() body
  - `packages/dagger-module/src/types.ts` — minor: `ReporterInputs` unchanged
  - `packages/dagger-module/src/reporting.ts` — add `auditSummary` field to `PipelineReportOutputs`
  - `packages/dagger-module/src/audit-types.ts` — **new file**: all audit-specific types
  - `packages/dagger-pipelines/src/audit-workflow.test.ts` — no regressions expected
  - `packages/dagger-pipelines/src/audit-smart.test.ts` — **new file**: fixture-based unit tests

---

## Constitution Check

> ⚠️ **Gap**: `.specify/memory/constitution.md` does not exist. Constitution constraints inferred from `.github/copilot-instructions.md` and codebase conventions.

| Convention                                                                     | Gate                | Status                                                   |
| ------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------- |
| All execution logic lives in Dagger module, not workflow YAML                  | ERROR on violation  | ✅ Pass — detection + aggregation in `index.ts`          |
| `@func()` names align with kebab-case workflow call values                     | ERROR on violation  | ✅ Pass — `audit` → `audit` unchanged                    |
| Defaults sourced from `defaults.json` where applicable                         | WARN on drift       | ✅ Pass — no new scanner runtime defaults exposed        |
| Permissions are explicit and least-privilege                                   | ERROR on escalation | ✅ Pass — `audit.yaml` permissions unchanged             |
| Reusable workflow inputs must be actually used in workflow body                | ERROR on violation  | ✅ Pass — no new inputs added                            |
| No breaking changes to existing `@func()` signatures without explicit approval | ERROR on violation  | ✅ Pass — `audit` signature gains no new required params |
| New test coverage in `packages/dagger-pipelines/src/`                          | WARN if missing     | ✅ Planned — `audit-smart.test.ts`                       |

**Recommendation**: Create `.specify/memory/constitution.md` to codify these constraints for future planning runs.

---

## Design Decisions

See `research.md` for full rationale. Key decisions:

1. **Detection is pure TypeScript, no container** — Use `readOptionalText` probe-table pattern (same as `detectNodePackageManager`) against a fixed signal table. No container image needed; no network calls; deterministic.

2. **Parallel execution via `Promise.allSettled`** — Each scanner creates an independent Dagger container chain. `Promise.allSettled` collects all results and prevents one scanner's thrown error from canceling others. Dagger's lazy DAG scheduler executes container chains in parallel.

3. **`audit` @func() signature unchanged** — Language detection is transparently on by default. No new parameters added; no changes to the `audit.yaml` call site.

4. **Output envelope JSON shape preserved** — `{ markdown, report, reportJson, reportMarkdown }` unchanged. New audit data added as:
   - New numeric keys in `report.outputs.scanFindings` (additive, safe for `Record<string, number>`).
   - New optional `report.outputs.auditSummary: AuditSummary` field.
   - New `### Audit Intelligence` section appended to `report.markdown`.

5. **All new types in `audit-types.ts`** — Keeps `reporting.ts` generic and `types.ts` uncluttered. `PipelineReportOutputs` in `reporting.ts` gains one optional `auditSummary` field import.

6. **Scanner failure ≠ report loss** — A single scanner's container error is recorded in `report.errors` and `auditSummary.overallStatus = "degraded"`, while successful scanner results remain visible in the same consolidated report. This mirrors the spec's "scanner outage must not erase the whole audit result" requirement.

7. **Fallback mode is always surfaced** — If detection produces only `generic` family, `fallbackMode = true`, a warning is added to `report.warnings`, and the `### Audit Intelligence` markdown section shows a `⚠️` fallback notice.

8. **Scanner registry is small and extensible** — v1 ships with semgrep (cross-language) and gitleaks (cross-language) only. The `ScannerConfig` registry pattern allows adding family-scoped scanners (e.g. `cargo audit`, `npm audit`) in future iterations without changing the `audit` function signature.

---

## Work Breakdown

### 1. New types module

**File**: `packages/dagger-module/src/audit-types.ts` (new)

- Define `LanguageFamily`, `DetectionConfidence`, `DetectedFamily`, `DetectionResult`
- Define `ScannerStatus`, `TopFinding`, `AuditScannerResult`
- Define `AuditOverallStatus`, `AuditSummary`
- Define `ScannerConfig` interface (for extensible registry)

**Size**: ~100 lines. No dependencies on Dagger SDK types.

---

### 2. Extend `PipelineReportOutputs`

**File**: `packages/dagger-module/src/reporting.ts`

- Import `AuditSummary` from `audit-types.ts`
- Add `readonly auditSummary?: AuditSummary` to `PipelineReportOutputs`

**Size**: 3-line change. No impact on existing callers.

---

### 3. Private detection method

**File**: `packages/dagger-module/src/index.ts`

Add private method to `GhReusablePipelines`:

```typescript
private async detectLanguageFamilies(source: Directory): Promise<DetectionResult>
```

Implementation:

- Probe the signal table (see `data-model.md`) using `readOptionalText` for each sentinel file
- Assign confidence per family based on which signals are present
- Always include `generic` family
- Set `fallbackMode = true` if no family other than `generic` reaches `medium`+
- Return `DetectionResult`

**Size**: ~80 lines.

---

### 4. Private scanner runner helpers

**File**: `packages/dagger-module/src/index.ts`

Add private methods:

```typescript
private async runSemgrepScanner(source: Directory, config: string): Promise<AuditScannerResult>
private async runGitleaksScanner(source: Directory): Promise<AuditScannerResult>
```

Each method:

- Uses `runCapturedStep` internally (existing helper)
- Parses scanner JSON output for finding count and top findings
- Wraps errors and normalizes output into `AuditScannerResult`
- Returns `AuditScannerResult` (never throws — errors become `status: "failed"`)

Add private aggregation method:

```typescript
private aggregateAuditResults(
  scannerResults: AuditScannerResult[],
  detection: DetectionResult,
): AuditSummary
```

**Size**: ~150 lines total for scanner runners + aggregation.

---

### 5. Extend markdown renderer

**File**: `packages/dagger-module/src/index.ts` (inline, not in `reporting.ts`)

Add private method:

```typescript
private renderAuditIntelligenceSection(summary: AuditSummary): string
```

Appends to the base markdown:

- `### Audit Intelligence` header
- Detected language families (badges or list)
- Fallback mode warning if active
- Per-scanner status table (name, status icon, finding count, duration)
- Top findings list (severity-sorted, capped at 10)

**Size**: ~60 lines.

---

### 6. Refactor `audit` @func() body

**File**: `packages/dagger-module/src/index.ts`

Replace the current sequential semgrep→gitleaks body (lines 493–608) with:

1. `detectLanguageFamilies(source)` → `detection`
2. If `detection.fallbackMode` → `reporter.recordWarning()`
3. Build scanner promise array from registry filtered by detected families
4. `Promise.allSettled(scannerPromises)` → `settledResults`
5. Map settled results into `AuditScannerResult[]`
6. `aggregateAuditResults()` → `AuditSummary`
7. `reporter.setOutput("auditSummary", summary)`
8. `reporter.setOutput("scanFindings", { semgrep, gitleaks, total, detectedFamilyCount, fallbackMode, scannerFailureCount })`
9. `reporter.finalize()` → base report
10. Append audit intelligence section to `report.markdown`
11. Return JSON envelope (same shape as before)

**Backwards compat check**: All field names in the JSON envelope are identical to current output.

**Size**: ~60 lines (body shrinks due to extraction into helpers).

---

### 7. New test file

**File**: `packages/dagger-pipelines/src/audit-smart.test.ts` (new)

Fixture-based tests (no live containers, no Dagger SDK required):

- Import `detectLanguageFamilies` logic via test-accessible helper OR test the aggregation/detection functions directly if they are extracted into a testable module
- **Alternative approach** (preferred for testability): Extract detection and aggregation into a pure-function module `packages/dagger-module/src/audit-logic.ts` that takes plain file-presence maps instead of `Directory` objects. Tests import from `audit-logic.ts`. The `index.ts` bridges `Directory` to file maps.

Test cases (see `quickstart.md` for full scenarios):

- Single-language detection (Rust fixture)
- Mixed-language detection (Node + Python + Rust fixture)
- Fallback mode (no signals)
- Scanner failure isolation (one fails, other preserved)
- All scanners fail → `failed` overall status
- `overallStatus` derivation rules
- `topFindings` severity ordering
- `scanFindings` new key values

**Size**: ~200 lines.

---

### 8. Ensure existing tests pass

No changes needed to:

- `audit-workflow.test.ts` — workflow YAML is unchanged
- `dagger-module-integration.test.ts` — `audit` function name unchanged, no new `@func()` added
- `security-workflows.test.ts` — `codeql.yaml` and `dependency-review.yaml` unchanged

Run to confirm:

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test
pnpm run typecheck
```

---

## Contract Safety Checklist

- [x] Reusable workflow input/secret declarations match usage — `audit.yaml` unchanged
- [x] Dagger call names remain aligned with module `@func()` names — `audit` → `audit`
- [x] Defaults are sourced from `defaults.json` where applicable — no new scanner runtime defaults
- [x] Permissions are explicit and least-privilege — `audit.yaml` permissions unchanged
- [x] No hardcoded runtime drift outside standards wiring — scanner images pinned, same versions
- [x] No breaking changes to `audit` function signature — no new required params
- [x] Output JSON envelope shape preserved — additive fields only

---

## Risks and Mitigations

| Risk                                                                                    | Likelihood | Impact | Mitigation                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Detection probe misses a family in monorepos with nested manifests                      | Medium     | Low    | Signal table probes root-level files only for v1; warn in research.md for future                                                           |
| `Promise.allSettled` with Dagger containers behaves differently from sequential `await` | Low        | High   | The existing `detectNodePackageManager` and multi-step pipelines already use async/await with Dagger; validate with integration smoke test |
| `PipelineReportOutputs.auditSummary` import creates circular dependency                 | Low        | Medium | `audit-types.ts` has no imports from `reporting.ts`; `reporting.ts` imports from `audit-types.ts` one-way                                  |
| `audit-logic.ts` extraction (for testability) changes observable behavior               | Low        | Low    | Pure functions — no side effects, no Dagger SDK calls; behavior identical                                                                  |
| `topFindings` extraction from scanner JSON requires schema assumptions                  | Medium     | Low    | Add try/catch with fallback to empty array; log warning but never throw                                                                    |

---

## Validation Matrix

| Contract surface                                           | Change             | Validation                                     |
| ---------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| `audit.yaml` inputs/permissions                            | None               | `audit-workflow.test.ts` (existing, unchanged) |
| Dagger `audit` function name                               | None               | `dagger-module-integration.test.ts` (existing) |
| `codeql.yaml` / `dependency-review.yaml` / `security.yaml` | None               | `security-workflows.test.ts` (existing)        |
| `PipelineReportOutputs.auditSummary` type                  | New optional field | `pnpm run typecheck`                           |
| Detection logic (all fixture shapes)                       | New                | `audit-smart.test.ts` (new)                    |
| Aggregation logic (all status paths)                       | New                | `audit-smart.test.ts` (new)                    |
| Scanner failure isolation                                  | New                | `audit-smart.test.ts` (new)                    |
| Fallback mode warnings                                     | New                | `audit-smart.test.ts` (new)                    |
| Output JSON envelope shape                                 | Additive           | `audit-smart.test.ts` (new)                    |
| Markdown `### Audit Intelligence` section                  | New                | `audit-smart.test.ts` (new)                    |
