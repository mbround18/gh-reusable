# Pipeline Change Spec: Restore Dagger SDK Runtime Compatibility for Dependency Pinning PR

## Summary

This PR updates dependency pins across workflows/actions/packages and includes a targeted adjustment to keep Dagger TypeScript SDK runtime installs stable in CI.

## Affected Contracts

- Reusable workflows: no input/secret/output contract changes.
- Dagger module functions: no `@func()` signature or output shape changes.
- Downstream repos impacted: none; behavior remains contract-compatible.

## Compatibility Classification

- Classification: compatible
- Justification: changes are dependency/version and tooling compatibility maintenance with no API or workflow interface changes.

## Runtime and Defaults Impact

- `defaults.json` changes: none.
- Container/runtime baseline changes: pin `packages/dagger-module` package-manager metadata to pnpm 10.15.1 for Dagger SDK runtime install compatibility.

## Security and Permissions Impact

- Permissions deltas: none.
- Security scanner/policy deltas: none.

## Validation Plan

- Tests/checks run: PR CI checks (including parity and governance checks) on this branch.
- Expected signals: no `ERR_PNPM_IGNORED_BUILDS` failure in Dagger parity jobs and spec governance check passes.

## Consumer Impact and Migration

- Consumer impact: none expected.
- Migration guidance: no migration required.

## Rollout and Rollback

- Rollout strategy: merge through normal PR workflow after green required checks.
- Rollback procedure: revert this PR commit if regressions are detected.

## Exception Plan (if needed)

- Exception required?: no
- Owner: n/a
- Expires at: n/a
- Remediation plan: n/a
