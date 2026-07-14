# Pipeline Change Spec: Surface Dagger pipeline reports as markdown and fail on reported errors

## Summary

Centralize structured Dagger pipeline report handling in `.github/actions/dagger-run/action.yml` so reusable workflows consistently show human-readable markdown and fail when the report itself indicates failure.

## Affected Contracts

- Reusable workflows: any workflow using `.github/actions/dagger-run`
- Dagger module functions: unchanged public function signatures; consumes existing `{ success, report, markdown/reportMarkdown }` envelopes
- Downstream repos impacted: all consumers of gh-reusable workflows/actions that run Dagger pipelines
- New local action: `.github/actions/dagger-run` now delegates envelope parsing/rendering to `.github/actions/dagger-report` (TypeScript, built with `@actions/core`), invoked via `uses: ./.github/actions/dagger-report`. `dagger-run`'s public inputs/outputs are unchanged.

## Compatibility Classification

- Classification: compatible
- Justification: existing `stdout` output remains unchanged; new `report-markdown` and `pipeline-success` outputs are additive

## Runtime and Defaults Impact

- `defaults.json` changes: none
- Container/runtime baseline changes: none

## Security and Permissions Impact

- Permissions deltas: none
- Security scanner/policy deltas: none

## Validation Plan

- Tests/checks run: `pnpm --filter @gh-reusable/dagger-report-action run test`, `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-run-action.test.ts`, and `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflows.test.ts src/rust-workflow.test.ts src/dagger-module-integration.test.ts`
- Expected signals: `dagger-report`'s unit tests cover structured success/failure, noisy stdout envelopes, and fail-closed behavior for unparsable `success:false` output; `dagger-run`'s tests confirm it wires raw stdout into the `dagger-report` action and re-exports its outputs; workflow governance/integration coverage remains green

## Consumer Impact and Migration

- Consumer impact: improved job readability in logs/summary and consistent failure semantics when Dagger reports `success: false` or report errors
- Migration guidance: no required migration; optional adoption of new action outputs (`report-markdown`, `pipeline-success`)

## Rollout and Rollback

- Rollout strategy: merge and release as part of normal reusable workflow/action updates
- Rollback procedure: revert `.github/actions/dagger-run/action.yml` to prior behavior

## Exception Plan (if needed)

- Exception required?: no
- Owner:
- Expires at:
- Remediation plan:
