# Implementation Plan: [PIPELINE CHANGE TITLE]

## Inputs

- Linked feature spec: `[path/to/spec.md]`
- Affected paths:
  - `.github/workflows/...`
  - `.github/actions/...`
  - `packages/dagger-module/src/...`
  - `packages/dagger-pipelines/src/...`

## Design Decisions

- Key implementation choices and tradeoffs.
- Why this approach preserves downstream workflow contracts.

## Work Breakdown

1. Workflow/action contract updates
2. Dagger function/runtime updates
3. Governance/tests/docs updates
4. Release and propagation plan

## Contract Safety Checklist

- [ ] Reusable workflow input/secret declarations match usage
- [ ] Dagger call names remain aligned with module `@func()` names
- [ ] Defaults are sourced from `defaults.json` where applicable
- [ ] Permissions are explicit and least-privilege
- [ ] No hardcoded runtime drift outside standards wiring

## Validation Matrix

List each changed contract and the test/check that validates it.

| Contract surface  | Validation                                               |
| ----------------- | -------------------------------------------------------- |
| Workflow wiring   | `packages/dagger-pipelines` governance/integration tests |
| Runtime defaults  | `standards-defaults` tests                               |
| Security behavior | security/audit workflow tests                            |
