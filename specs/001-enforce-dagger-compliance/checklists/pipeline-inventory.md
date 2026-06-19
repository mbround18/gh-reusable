# Pipeline Compliance Inventory

## Scope

- Feature: `001-enforce-dagger-compliance`
- Standard: `dagger-compliance-v1`
- Last updated: 2026-06-19

## Required pipeline contracts

- [x] Reusable workflows use explicit `permissions`.
- [x] Dagger invocations use `with.call` and do not use `with.verb` / `with.args`.
- [x] Dagger call names map to exported module `@func()` names (kebab-case).
- [x] Runtime defaults are sourced from `defaults.json` + `defaults.schema.json`.
- [x] Pipeline-impacting PRs are gated by spec-governance checks.

## Validation matrix

- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflow-governance.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-module-integration.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/standards-defaults.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/security-workflows.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-workflow.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/release-workflows.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/publish-workflow.test.ts`
- [x] `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/spec-governance-workflow.test.ts`
- [x] `pnpm run typecheck`
- [x] `pnpm run test`
