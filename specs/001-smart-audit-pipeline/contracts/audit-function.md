# Contract: `audit` Dagger Function

**Module**: `GhReusablePipelines` (`packages/dagger-module/src/index.ts`)  
**Decorator**: `@func()`  
**Consumer entry point**: `.github/workflows/audit.yaml` → `.github/actions/dagger-run` → `dagger call audit ...`

---

## Function Signature (TypeScript)

```typescript
@func()
async audit(
  source: Directory,
  semgrepConfig: string = "auto",
  includeGitleaks: boolean = true,
): Promise<string>
```

### Parameters

| Parameter        | Type        | Default  | Required | Notes                                                                 |
| ---------------- | ----------- | -------- | -------- | --------------------------------------------------------------------- |
| `source`         | `Directory` | —        | ✅ yes   | The repository root to scan. Passed as `--source=.` from the workflow. |
| `semgrepConfig`  | `string`    | `"auto"` | no       | Semgrep ruleset config string. Forwarded as `SEMGREP_CONFIG` env var. |
| `includeGitleaks`| `boolean`   | `true`   | no       | When `false`, the gitleaks scanner is skipped entirely.               |

> **Backwards compat guarantee**: No new parameters are added to this signature in v1. Language detection is transparently on by default with no opt-in required.

---

## Return Shape

The function returns a **JSON string** with the following envelope. This shape is unchanged from the current implementation.

```typescript
interface AuditFunctionOutput {
  markdown: string;        // Full audit report markdown (PR comment body)
  report: PipelineReport;  // Structured report object (see PipelineReport below)
  reportJson: string;      // JSON-serialized report (for artifact upload)
  reportMarkdown: string;  // Duplicate of markdown (legacy compat alias)
}
```

### `PipelineReport` (relevant fields)

```typescript
interface PipelineReport {
  metadata: PipelineReportMetadata;  // timestamps, commit, branch, dagger engine
  inputs: PipelineReportInputs;      // sourceDir, registries, credentials
  steps: PipelineReportStep[];       // one entry per scanner run
  outputs: PipelineReportOutputs;    // see below
  errors: PipelineReportError[];     // scanner execution failures land here
  warnings: string[];                // fallback-mode and degraded-mode warnings
  markdown: string;                  // same as top-level .markdown
}
```

### `PipelineReportOutputs` (relevant fields)

```typescript
interface PipelineReportOutputs {
  scanFindings: {
    // Pre-existing keys (stable):
    semgrep: number;
    gitleaks: number;
    total: number;
    // New keys added by Smart Audit Pipeline (additive, backwards compatible):
    detectedFamilyCount: number;
    fallbackMode: 0 | 1;             // 1 if fallback active
    scannerFailureCount: number;
  };
  auditSummary: AuditSummary;        // NEW — see data-model.md
}
```

> The final markdown returned by `audit` appends an `### Audit Intelligence` section, while the underlying workflow entrypoint and function signature remain unchanged.

---

## Workflow Call Site (audit.yaml)

```yaml
- name: Run Dagger audit module
  id: dagger_audit
  uses: mbround18/gh-reusable/.github/actions/dagger-run@main
  with:
    call: >-
      audit
      --source=.
      --semgrep-config=${{ inputs.semgrep_config }}
      --include-gitleaks=${{ inputs.include_gitleaks }}
    cloud-token: ${{ secrets.DAGGER_CLOUD_TOKEN }}
```

**No changes to this call site are required or permitted for v1.**

---

## Workflow Inputs (audit.yaml) — Unchanged

| Input                  | Type    | Default          | Notes                                     |
| ---------------------- | ------- | ---------------- | ----------------------------------------- |
| `runs-on`              | string  | `ubuntu-latest`  | No change                                 |
| `semgrep_config`       | string  | `auto`           | No change                                 |
| `include_gitleaks`     | boolean | `true`           | No change                                 |
| `create_alerts`        | boolean | `false`          | No change                                 |
| `track_release_summary`| boolean | `false`          | No change                                 |

> **No new required inputs.** Any future optional input extension must keep `required: false` with a sensible default.

---

## Report Surfaces (Preserved)

All downstream consumers of the audit report receive the same report surface they currently rely on.

### PR Sticky Comment

- **Marker**: `<!-- gh-reusable:audit:status -->`  
- **Trigger**: `github.event_name == 'pull_request'`  
- **Content**: `step.audit_summary.outputs.markdown` — now enriched with `### Audit Intelligence` section appended after the standard pipeline summary.

### Artifact Upload

- **Artifact name**: `audit-report`  
- **Files**: `report.json`, `report.md`  
- **`report.json`**: shape unchanged (additive fields only)  
- **`report.md`**: enriched markdown content

### Tag Release Notes

- **Markers**: `<!-- gh-reusable:audit:summary:start -->` / `<!-- gh-reusable:audit:summary:end -->`  
- **Condition**: `startsWith(github.ref, 'refs/tags/') && inputs.track_release_summary`  
- **Content**: same enriched markdown

---

## Failure Modes and Guarantees

| Scenario                               | Outcome                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| All scanners pass, no findings         | `report.errors = []`, `overallStatus = "pass"`           |
| Scanner returns findings               | `report.errors = []`, `overallStatus = "findings"`        |
| One scanner container throws/fails     | Scanner recorded as `failed` in `auditSummary.scanners`, `report.errors` gets one entry, other scanner results preserved, `overallStatus = "degraded"` |
| All scanners fail                      | `report.errors` non-empty, `overallStatus = "failed"`, workflow step fails via `core.setFailed` |
| No language family detected            | `fallbackMode = true`, warning added to `report.warnings`, `generic` family used, semgrep + gitleaks run with default config |
| `includeGitleaks = false`              | Gitleaks scanner status is `"skipped"`, `gitleaks: 0` in `scanFindings` |

---

## Validation Coverage

| Contract surface                     | Test location                                                    |
| ------------------------------------ | ---------------------------------------------------------------- |
| Workflow inputs / permissions        | `packages/dagger-pipelines/src/audit-workflow.test.ts` (existing) |
| Dagger call name alignment           | `packages/dagger-pipelines/src/dagger-module-integration.test.ts` (existing) |
| Detection + aggregation logic        | `packages/dagger-pipelines/src/audit-smart.test.ts` (new)       |
| Scanner failure isolation            | `packages/dagger-pipelines/src/audit-smart.test.ts` (new)       |
| Fallback mode reporting              | `packages/dagger-pipelines/src/audit-smart.test.ts` (new)       |
| `AuditSummary` shape                 | `packages/dagger-pipelines/src/audit-smart.test.ts` (new)       |
| `scanFindings` new keys              | `packages/dagger-pipelines/src/audit-smart.test.ts` (new)       |
