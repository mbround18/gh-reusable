# Quickstart Validation Guide: Smart Audit Pipeline

This guide describes how to validate that the Smart Audit Pipeline feature is working end-to-end. It covers prerequisites, test commands, and expected outcomes for each supported scenario.

See [`data-model.md`](./data-model.md) for type definitions and [`contracts/audit-function.md`](./contracts/audit-function.md) for the full function contract.

---

## Prerequisites

```bash
# From repository root
pnpm install
pnpm run build
```

Node.js 20+ and pnpm are required (see `package.json` for exact versions). Dagger is not required for unit/integration tests — all tests use fixture-based inputs, not live container execution.

---

## Scenario 1: Existing Tests Must Still Pass

Validate that the backwards-compat guarantee holds — no regressions on the existing audit workflow tests.

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-workflow.test.ts
```

**Expected**: All existing tests pass. Key assertions:

- `audit.yaml` still exposes `create_alerts`, `track_release_summary`, `semgrep_config`, `include_gitleaks` inputs.
- Permissions still include `security-events: write`, `contents: write`, `pull-requests: write`.
- The dagger-run step still has `call` containing `"audit"`.
- PR sticky comment, history comment, artifact upload, and release notes steps all present.

---

## Scenario 2: Dagger Module Integration Alignment

Validate that the `audit` @func() name is still the only name in the module and still aligned with the workflow call.

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-module-integration.test.ts
```

**Expected**: `audit` remains in the exported function list. No new function names are introduced (detection logic is private).

---

## Scenario 3: Smart Detection and Aggregation Unit Tests

Run the new smart audit unit tests (fixture-based, no containers):

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-smart.test.ts
```

**Expected outcomes per fixture:**

### 3a — Single-language repo (Rust)

- Input fixture signals: `Cargo.toml`, `Cargo.lock`
- `detectedFamilies` contains exactly `["rust", "generic"]`
- `detectionConfidence` = `"high"`
- `fallbackMode` = `false`
- Report markdown contains `### Audit Intelligence` section
- Report markdown mentions `rust` family

### 3b — Mixed-language repo (Node + Python + Rust)

- Input fixture signals: `Cargo.toml`, `package.json`, `pnpm-lock.yaml`, `pyproject.toml`, `uv.lock`
- `detectedFamilies` contains `["rust", "node", "python", "generic"]`
- All scanners listed in `auditSummary.scanners`
- `totalFindings` = sum of per-scanner findings
- `topFindings` sorted by severity (critical first)

### 3c — Ambiguous/empty repo (no signals)

- Input fixture signals: no manifest files
- `detectedFamilies` = `["generic"]`
- `fallbackMode` = `true`
- `report.warnings` contains at least one entry mentioning fallback
- Report markdown contains `⚠️` fallback warning
- Overall audit still completes with a report (not aborted)

### 3d — Scanner execution failure (one scanner fails)

- Scanner fixture: semgrep returns exit code 0, gitleaks throws/rejects
- `auditSummary.scanners` contains gitleaks entry with `status: "failed"`
- `report.errors` has one entry for gitleaks
- `auditSummary.overallStatus` = `"degraded"`
- semgrep results are still present in the report
- the workflow summary still renders successfully for the remaining scanners

### 3f — Audit intelligence remains additive

- The reusable workflow entrypoint stays `.github/workflows/audit.yaml`
- The human-readable summary appends `### Audit Intelligence`
- Existing PR comment, artifact, and release-note surfaces continue to use the same consolidated markdown output

### 3e — All scanners fail

- Both scanner fixtures reject
- `auditSummary.overallStatus` = `"failed"`
- `report.errors` has entries for both scanners
- Report markdown still renders (shows failure sections)
- The `audit` function resolves (does **not** throw) — the workflow step decides pass/fail via `core.setFailed`

---

## Scenario 4: Full Test Suite

Confirm no regressions across all dagger-pipelines tests:

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test
```

**Expected**: All tests pass. The new `audit-smart.test.ts` is included.

---

## Scenario 5: Type Check

Confirm new types integrate cleanly:

```bash
pnpm run typecheck
```

**Expected**: Zero TypeScript errors. The `AuditSummary` field addition to `PipelineReportOutputs` should not require changes to any other pipeline function since the field is optional.

---

## Validating Report Surfaces (Manual / CI)

The following can only be validated against a live GitHub repository run. They are included here for reference but are not part of the automated test suite.

### PR Comment

After triggering a PR run of `audit.yaml`:

1. A sticky comment with `<!-- gh-reusable:audit:status -->` marker appears (or is updated).
2. The comment body includes the `### Audit Intelligence` section.
3. Detected families are listed.
4. If fallback mode was active, a `⚠️` warning is visible.

### Artifact

Download the `audit-report` artifact:

1. `report.json` contains `outputs.auditSummary` with a valid `AuditSummary` shape.
2. `report.json` contains `outputs.scanFindings` with `detectedFamilyCount`, `fallbackMode`, `scannerFailureCount` keys.
3. `report.md` contains the `### Audit Intelligence` section.

### Release Notes (tag-triggered)

On a tag push with `track_release_summary: true`:

1. Release notes contain the `<!-- gh-reusable:audit:summary:start -->` block.
2. Block includes the enriched markdown with the `### Audit Intelligence` section.

---

## Key References

- Contract: [`contracts/audit-function.md`](./contracts/audit-function.md)
- Data model: [`data-model.md`](./data-model.md)
- Research decisions: [`research.md`](./research.md)
- Existing audit workflow: [`.github/workflows/audit.yaml`](../../.github/workflows/audit.yaml)
- Dagger module entry: [`packages/dagger-module/src/index.ts`](../../packages/dagger-module/src/index.ts) (lines 492–608)
- Reporting types: [`packages/dagger-module/src/reporting.ts`](../../packages/dagger-module/src/reporting.ts)
