# Research: Smart Audit Pipeline

## Summary

All open design questions have been resolved through codebase analysis. No external research was needed beyond reading existing code patterns.

---

## Decision 1: Language Detection Strategy

**Decision**: Probe-based file/manifest detection using `readOptionalText` (already used by `detectNodePackageManager`).

**Rationale**: The existing `detectNodePackageManager` private method in `GhReusablePipelines` proves the pattern: probe a fixed set of sentinel files from the Dagger `Directory`, classify by presence/absence, and return a typed result. This is cheap (no container needed), deterministic, and trivially extensible by adding new signal entries.

**Signal table** (confidence degrades from high → medium → low → baseline):

| Family   | High-confidence signals           | Medium-confidence signals        |
| -------- | --------------------------------- | -------------------------------- |
| `rust`   | `Cargo.toml` + `Cargo.lock`       | `Cargo.toml` alone               |
| `node`   | `package.json` + any lockfile     | `package.json` alone             |
| `python` | `pyproject.toml` or `uv.lock`     | `requirements.txt` / `setup.py`  |
| `go`     | `go.mod` + `go.sum`               | `go.mod` alone                   |
| `docker` | `Dockerfile`                      | `docker-compose.yml` alone       |
| `generic`| (always present as fallback)      | n/a                              |

**Fallback rule**: If no family reaches `medium` or higher confidence, set `fallbackMode = true` and add a warning in the audit report. The `generic` family is always included so semgrep + gitleaks always run.

**Alternatives considered**: Using GitHub Linguist-style byte-counting (too heavy for a Dagger function that runs without network) or file-extension glob counting (false positives in vendor dirs). The probe approach matches the existing codebase pattern and avoids dependencies.

---

## Decision 2: Parallel Scanner Execution

**Decision**: Wrap each scanner's async Dagger chain in a `Promise` and collect all with `Promise.allSettled`. Use `Promise.allSettled` (not `Promise.all`) so a thrown error in one scanner does not cancel others.

**Rationale**: Dagger's TypeScript SDK already resolves container pipelines lazily; calling multiple `container.withExec(...)` chains and then awaiting them concurrently via `Promise.allSettled` lets Dagger's internal DAG scheduler execute container work in parallel. The repo already uses sequential `await` per scanner; switching to `Promise.allSettled` is the minimal change to achieve concurrency without restructuring the existing `runCapturedStep` helper.

**Scanner fault isolation**: Each scanner result is wrapped in a `SettledScannerResult` (fulfilled = success or finding-only failure; rejected = execution/container error). Rejected results are recorded as `PipelineReportError` entries and contribute a `failed` status in `AuditScannerResult`. A fully-failed scanner does **not** change the output envelope shape; the `overallStatus` field in `AuditSummary` captures the degraded state.

**Alternatives considered**: Dagger's native `dag.pipeline()` grouping (not exposed in the TS SDK at the level needed); Node.js `worker_threads` (unnecessary overhead). `Promise.allSettled` is idiomatic and safe.

**Implementation note**: The shipped v1 scanner registry keeps semgrep and gitleaks as cross-language baseline scanners, so weak or ambiguous repository detection still yields a usable report instead of suppressing scanning entirely.

---

## Decision 3: Backwards-Compatible Output Envelope

**Decision**: The JSON string returned by `audit` keeps its current envelope shape: `{ markdown, report, reportJson, reportMarkdown }`. The `report` field is a `PipelineReport`. New audit-specific data is added as:
1. New keys in `report.outputs.scanFindings` record (additive, numeric).
2. A new optional `auditSummary` field on `PipelineReportOutputs` (additive).
3. A new `### Audit Intelligence` section appended to `report.markdown` (additive).

**Rationale**: The `audit.yaml` workflow step already parses `DAGGER_STDOUT` as JSON and reads:
- `report.report` or `report` for the payload
- `report.reportMarkdown` or `report.markdown` for the PR comment body
- `(payload.errors || report.errors || []).length > 0` for failure detection
- `report.reportMarkdown || report.markdown` for the human-readable summary

None of these paths are broken by additive changes. The `scanFindings` type in `PipelineReportOutputs` is `Readonly<Record<string, number>>` so it safely accepts new numeric keys (`detectedFamilyCount`, `fallbackMode` as 0/1). Rich non-numeric data (family names, per-scanner status) lives in `auditSummary`.

**Alternatives considered**: A separate JSON output file written to disk (requires workflow step changes). A new Dagger function (breaks existing `audit` call sites). Both rejected on backwards-compat grounds.

---

## Decision 4: `PipelineReportOutputs` Extension Strategy

**Decision**: Add `auditSummary?: AuditSummary` to `PipelineReportOutputs` in `reporting.ts`. Add `AuditSummary` and supporting types to a new `packages/dagger-module/src/audit-types.ts` file.

**Rationale**: Keeping audit-specific types isolated in their own file avoids coupling the generic `reporting.ts` with audit domain logic, consistent with the existing `cache.ts` / `cache-utils.ts` pattern. The `reporting.ts` `PipelineReportOutputs` interface gains one optional property — a safe, additive TypeScript change.

**Alternatives considered**: Stuffing everything into `types.ts` (already large; separation of concerns preferable). Keeping all types inline in `index.ts` (makes the audit function body harder to test in isolation).

---

## Decision 5: Markdown Rendering Extension

**Decision**: Extend the existing `renderPipelineReportMarkdown` function by having the `audit` function append an `### Audit Intelligence` block to the base `report.markdown` string before wrapping in the output envelope. The base renderer is not modified.

**Rationale**: `renderPipelineReportMarkdown` is a shared utility used by non-audit pipelines. Modifying it for audit-specific sections would either require an `if` branch (awkward) or a new parameter (breaking for callers). Post-processing the returned string in the `audit` function body is clean and keeps the renderer generic.

**Alternatives**: Passing an `extraSections` parameter to the renderer (considered; rejected as premature abstraction for one caller).

---

## Decision 6: `audit` @func() Signature

**Decision**: No new required parameters. No new public parameters initially — language detection is transparently on by default.

**Rationale**: Any new parameter must be added to the `audit.yaml` `dagger-run` call, which then invalidates the `dagger-module-integration.test.ts` compliance check. Adding detection as a default-on internal behavior requires zero workflow changes and zero test fixture updates for existing consumers.

**Future extensibility**: If a consumer wants to override detection (e.g. force a family), a new optional `languageFamilyOverride: string = ""` parameter can be added later.

---

## Decision 7: Constitution Check (Inferred — No `constitution.md` Found)

**Gap noted**: `.specify/memory/constitution.md` does not exist in this repository. The following conventions are inferred from `.github/copilot-instructions.md` and existing code:

| Convention | Status |
| --- | --- |
| Thin workflows / Dagger-first logic | ✅ All new logic in `packages/dagger-module/src/` |
| `@func()` names align with kebab-case call names | ✅ `audit` → `audit` unchanged |
| Defaults sourced from `defaults.json` | ✅ No new scanner runtime deps exposed to defaults |
| Permissions least-privilege | ✅ Existing `audit.yaml` permissions unchanged |
| Backwards compat for workflow inputs | ✅ No new required inputs |
| Tests in `packages/dagger-pipelines/src/` | ✅ New test file planned |

**Recommendation**: Create `.specify/memory/constitution.md` to codify these constraints formally for future `speckit.plan` runs.
