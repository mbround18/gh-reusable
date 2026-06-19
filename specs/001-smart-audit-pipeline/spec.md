# Feature Specification: Smart Audit Pipeline

## Summary

Upgrade the audit pipeline so it can infer which language families are present in a repository, run the relevant scanners in parallel, and return one clear user-facing report that highlights the important failures first.

## Motivation and Problem Statement

The current audit pipeline is useful but too blunt: it treats audit execution more like a fixed checklist than a repository-aware inspection. That means mixed-language repositories, partial scanner failures, and unsupported stacks can produce noisy or incomplete results that are harder for users to act on quickly.

This change guarantees that audit results stay useful even when the repository shape is unusual or when some scanners fail, by falling back to sane defaults and presenting a consolidated summary instead of raw scanner noise.

## Scope

### In scope

- Detect supported language families from repository contents and manifests.
- Select scanners based on the detected repository makeup.
- Run scanners independently so slow checks do not block other checks.
- Aggregate all scanner results into a single user-facing audit summary.
- Surface degraded or fallback behavior clearly when detection confidence is low or scanner execution is incomplete.
- Preserve the existing audit workflow entrypoints and reporting surfaces.

### Out of scope

- Full autofix or remediation automation.
- Expanding support to every possible language ecosystem.
- Replacing the current audit entrypoints with a new workflow.
- Changing repository permissions beyond what the audit workflow already needs.

## Assumptions

- Detection can rely on repository file, manifest, and lockfile signals.
- The pipeline should prefer repo-wide baseline scanners when language detection is inconclusive.
- Existing audit consumers should continue to work without changing their inputs.

## Affected Contracts

- Reusable audit workflow inputs, outputs, and report surfaces must remain backwards compatible.
- The Dagger `audit` contract may gain smarter detection and aggregation behavior, but its consumer-facing result shape should remain stable where possible.
- PR comments, artifacts, and tag release summaries should continue to receive the same kind of consolidated audit summary content.

## Runtime and Defaults Impact

- This feature should not require a change to the shared runtime defaults baseline.
- Any scanner-specific runtime needs must stay internal to the audit pipeline contract and not leak into repo-wide defaults.

## Security and Permissions Impact

- The current least-privilege audit permissions should remain sufficient for scanning, PR commenting, and optional code scanning uploads.
- The pipeline must continue to treat scanner execution as read-only analysis, not as a mutation path.

## User Scenarios and Testing

- A pull request in a single-language repository receives a concise audit summary with only the relevant scanner families shown.
- A mixed-language repository receives one aggregated audit result that combines all applicable scanners and highlights the most important failures first.
- A repository with weak or ambiguous language signals still receives a usable audit report with fallback defaults clearly marked.
- A scanner outage or malformed scanner output does not erase the whole audit result; the report shows the degraded state and the remaining valid findings.

## Functional Requirements

1. The audit pipeline must detect the repository's supported language families from its contents before choosing scanners.
2. The audit pipeline must select scanner coverage based on the detected language families and include a repo-wide baseline when detection is uncertain.
3. Scanner execution must be independent so one slow or failing scanner does not prevent other scanner results from being collected.
4. The final report must aggregate scanner outcomes into a single summary with overall status, per-scanner status, and the most actionable failures first.
5. The final report must identify when fallback defaults were used and why the pipeline could not rely on confident language detection.
6. If one or more scanners fail, the pipeline must still return a report that distinguishes execution failure from security findings.
7. Existing audit workflow surfaces must continue to present the consolidated summary without requiring users to inspect raw logs.
8. The pipeline must preserve backwards compatibility for current audit consumers unless a breaking change is explicitly approved later.

## Success Criteria

- 100% of audit runs on supported repositories produce a single consolidated summary artifact.
- 100% of runs with at least one supported language family show that family in the final report.
- 100% of scanner execution failures still result in a completed audit report with the failure called out explicitly.
- Users can identify the overall audit state, detected language families, and top failing scanners from the summary without reading raw scanner logs.
- Repositories with ambiguous or unsupported language signals still receive a meaningful fallback audit result instead of a blank or aborted report.

## Risks and Mitigations

- **Risk:** Language detection is too narrow and misses real scanners. **Mitigation:** Prefer conservative fallback defaults and keep the detection rules extensible.
- **Risk:** Parallel scans make the report harder to read. **Mitigation:** Normalize all scanner outputs into one aggregated summary with a consistent severity ordering.
- **Risk:** One scanner outage makes the whole audit feel broken. **Mitigation:** Treat scanner execution failures as reportable failures while preserving all successful results.
- **Risk:** Fallback behavior becomes noisy for users. **Mitigation:** Clearly mark degraded mode and explain why fallback defaults were used.

## Validation Plan

- Add contract coverage for audit workflow inputs, permissions, and report surfaces.
- Add fixture-based coverage for single-language, mixed-language, ambiguous, and scanner-failure repository shapes.
- Verify the audit summary still feeds PR comments, artifacts, and optional release summaries in a consistent format.
- Confirm the final report distinguishes security findings from scanner execution failures and fallback mode.

## Rollout and Rollback

- Ship behind the existing audit workflow entrypoints so downstream repos keep their current integration path.
- If regressions appear, consumers can pin to the last known-good reusable workflow reference while the audit pipeline is corrected.
- Rollback should restore the previous audit behavior without changing downstream workflow inputs.
