# Pipeline Change Spec: Upgrade `actions/checkout` to v7

## Summary

Dependabot updated every reusable workflow and workflow parity test that uses `actions/checkout` from v6 to v7. This is a maintenance-only update to the checkout action pin and does not change any repo-owned workflow contract.

## Affected Contracts

- Reusable workflows: `.github/workflows/*.yaml` entries that invoke `actions/checkout`
- Dagger module functions: none
- Downstream repos impacted: none; consumer-facing workflow inputs, outputs, and call contracts are unchanged

## Compatibility Classification

- Classification: compatible
- Justification: this is a direct third-party action version bump with no changes to workflow shape, permissions, or Dagger entrypoints.

## Runtime and Defaults Impact

- `defaults.json` changes: none
- Container/runtime baseline changes: none

## Security and Permissions Impact

- Permissions deltas: none
- Security scanner/policy deltas: updated checkout action pin only; no new permissions are introduced

## Validation Plan

- Tests/checks run:
  - spec-governance validation against the updated workflow diff
  - existing CI parity workflows after the PR is retried
- Expected signals:
  - the governance job accepts the updated spec artifact
  - workflow checks continue to exercise the same pipeline paths as before

## Consumer Impact and Migration

- Consumer impact: none
- Migration guidance: none required

## Rollout and Rollback

- Rollout strategy: merge the checkout bump together with this spec artifact
- Rollback procedure: revert the workflow bump and this spec artifact together

## Exception Plan (if needed)

- Exception required?: no
- Owner: -
- Expires at: -
- Remediation plan: -
