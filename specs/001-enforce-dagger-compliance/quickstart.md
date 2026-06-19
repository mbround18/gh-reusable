# Quickstart Validation Guide: Enforce Dagger Pipeline Compliance

This guide validates the feature end-to-end for maintainers before implementation rollout.

## Prerequisites

- Node + pnpm installed
- Repository cloned
- Dependencies installed

## Setup

```bash
pnpm install
```

## Validation Scenario A: Contract Wiring Integrity (P1)

Goal: Confirm pipeline changes are blocked when Dagger/workflow contracts drift.

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflow-governance.test.ts
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-module-integration.test.ts
```

Expected outcome:

- Tests pass on compliant state.
- Any workflow input/secret misuse or mismatched Dagger call name fails validation.

## Validation Scenario B: Runtime Defaults and Security Compliance

Goal: Confirm defaults and security constraints remain enforced.

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/standards-defaults.test.ts
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/security-workflows.test.ts
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-workflow.test.ts
```

Expected outcome:

- Runtime standards remain sourced from `defaults.json`.
- Reusable workflows retain explicit permission declarations and security behavior checks.

## Validation Scenario C: Full Workspace Confidence

Goal: Confirm no cross-package regressions before release.

```bash
pnpm run typecheck
pnpm run test
```

Expected outcome:

- Workspace checks pass with no regressions.

## Validation Scenario D: Compatibility and Spec Governance (P2)

Goal: Confirm downstream-compatibility checks and compatibility classification governance remain enforced.

```bash
pnpm --filter @gh-reusable/dagger-pipelines run test:compliance:us2
```

Expected outcome:

- release/publish interface compatibility checks pass.
- spec governance checks require compatibility classification metadata in pipeline change specs.

## Command Matrix

| Scope                   | Command                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| US1 compliance suite    | `pnpm --filter @gh-reusable/dagger-pipelines run test:compliance:us1` |
| US2 compatibility suite | `pnpm --filter @gh-reusable/dagger-pipelines run test:compliance:us2` |
| Full compliance suite   | `pnpm --filter @gh-reusable/dagger-pipelines run test:compliance`     |
| Workspace baseline      | `pnpm run typecheck && pnpm run test`                                 |

## Traceability

- Data entities and transitions: `specs/001-enforce-dagger-compliance/data-model.md`
- Compliance interface expectations: `specs/001-enforce-dagger-compliance/contracts/pipeline-compliance-contract.md`
