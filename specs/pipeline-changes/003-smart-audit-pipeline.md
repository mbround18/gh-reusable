# Pipeline Change Spec: Smart Audit Pipeline

## Summary

Enhance the existing `audit` pipeline to detect relevant language families, run scanners independently, and publish one consolidated, actionable summary without changing the workflow entrypoint or required inputs.

## Affected Contracts

- Reusable workflows: `.github/workflows/audit.yaml` (call surface preserved)
- Dagger module functions: `audit` in `packages/dagger-module/src/index.ts` (same signature, additive report data)
- Downstream repos impacted: consumers of `audit.yaml` report artifacts/comments receive richer summary content with backwards-compatible shape

## Compatibility Classification

- Classification: compatible
- Justification: no required workflow input changes, no function rename, and no breaking output contract removal; report additions are additive.

## Runtime and Defaults Impact

- `defaults.json` changes: none
- Container/runtime baseline changes: none

## Security and Permissions Impact

- Permissions deltas: none; audit workflow permission model is unchanged
- Security scanner/policy deltas: scanner orchestration and reporting changed, but no broadened permission scope

## Validation Plan

- Tests/checks run:
  - `packages/dagger-pipelines/src/audit-smart.test.ts`
  - `packages/dagger-pipelines/src/audit-workflow.test.ts`
  - `packages/dagger-pipelines/src/dagger-module-integration.test.ts`
- Expected signals:
  - language detection and fallback behavior are reflected in audit summary outputs
  - scanner failures degrade report status without erasing successful scanner results
  - workflow and Dagger integration contracts remain aligned

## Consumer Impact and Migration

- Consumer impact: audit reports include additional intelligence fields/sections while preserving existing entrypoint and output envelope
- Migration guidance: no migration required for existing consumers

## Rollout and Rollback

- Rollout strategy: ship smart-audit implementation and this spec artifact together
- Rollback procedure: revert the smart-audit implementation changes and this spec artifact in the same rollback

## Exception Plan (if needed)

- Exception required?: no
- Owner: -
- Expires at: -
- Remediation plan: -
