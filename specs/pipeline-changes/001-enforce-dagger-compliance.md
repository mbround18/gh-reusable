# Pipeline Change Spec: Enforce Dagger Pipeline Compliance

## Summary

Standardize pipeline governance around Dagger module contracts and explicit compatibility classification so CI rejects unclassified contract risk.

## Affected Contracts

- Reusable workflows: `pnpm-build-n-test.yaml`, `python-build-n-test.yaml`, `rust-build-n-test.yaml`, `publish.yaml`, `release-*.yaml`
- Dagger module functions: existing kebab-case `@func()` workflow entrypoints
- Downstream repos impacted: any consumers of reusable workflows/actions in this repository

## Compatibility Classification

- Classification: compatible
- Justification: this change tightens enforcement and documentation without removing existing supported interfaces.

## Runtime and Defaults Impact

- `defaults.json` changes: none
- Container/runtime baseline changes: none

## Security and Permissions Impact

- Permissions deltas: no broadened permission scope; explicit permission checks remain required
- Security scanner/policy deltas: none

## Validation Plan

- Tests/checks run:
  - `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflow-governance.test.ts src/dagger-module-integration.test.ts src/standards-defaults.test.ts src/security-workflows.test.ts src/audit-workflow.test.ts src/release-workflows.test.ts src/publish-workflow.test.ts src/spec-governance-workflow.test.ts`
- Expected signals:
  - all targeted governance and compliance tests pass
  - invalid compatibility metadata fails spec-governance checks

## Consumer Impact and Migration

- Consumer impact: none for compliant users
- Migration guidance: no migration needed

## Rollout and Rollback

- Rollout strategy: merge with governance tests and workflow checks in one change
- Rollback procedure: revert this PR and corresponding spec artifact

## Exception Plan (if needed)

- No exceptions required.
