# Implementation Plan: Enforce Dagger Pipeline Compliance

## Inputs

- Linked feature spec: `specs/001-enforce-dagger-compliance/spec.md`
- Affected paths:
  - `.github/workflows/**`
  - `.github/actions/**`
  - `packages/dagger-module/src/**`
  - `packages/dagger-pipelines/src/**`
  - `defaults.json`
  - `defaults.schema.json`

## Summary

Standardize all workflow execution paths around Dagger module contracts and governance tests so pipeline behavior is consistent, secure, and backward-compatible for downstream consumers.

## Technical Context

**Language/Version**: TypeScript (workspace; TS 6.x baseline), YAML for workflow/action contracts, Python 3.14 tooling support  
**Primary Dependencies**: `@dagger.io/dagger`, `vitest`, `yaml`, GitHub Actions reusable workflows/actions  
**Storage**: Repository files (`defaults.json`, workflow/action YAML, spec artifacts)  
**Testing**: Workspace `pnpm run test` / `pnpm run typecheck`; focused `pnpm --filter @gh-reusable/dagger-pipelines run test`  
**Target Platform**: GitHub Actions runners (`ubuntu-latest`) and local Linux/macOS developer environments  
**Project Type**: Monorepo (reusable workflows + reusable actions + Dagger module + governance tests)  
**Performance Goals**: Compliance checks execute in CI for every pipeline-impacting PR; no additional long-running orchestration required  
**Constraints**: Maintain backward compatibility for compliant consumers; enforce least-privilege permissions; avoid runtime-default drift outside `defaults.json`  
**Scale/Scope**: All active reusable workflows/actions and Dagger integration surfaces in this repository

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

`/specify/memory/constitution.md` is not present in this repository. For this feature, constitutional gates are derived from active repository governance and preset policy sources:

1. **Contract Integrity Gate** — Workflow call wiring and Dagger function name alignment must remain enforced by governance tests.
2. **Standards Source-of-Truth Gate** — Runtime defaults must remain centralized in `defaults.json`/`defaults.schema.json`.
3. **Security Gate** — Reusable workflows must keep explicit least-privilege permissions and security checks active.
4. **Spec Governance Gate** — Pipeline-impacting PRs must include compliant spec artifacts.

**Pre-Phase 0 Gate Status**: PASS (no unresolved clarifications remaining).

## Phase 0 Research Summary

See `specs/001-enforce-dagger-compliance/research.md` for decisions and alternatives covering:

- governance source selection in absence of a ratified constitution file,
- Dagger contract validation patterns,
- defaults and security enforcement patterns,
- validation command set for rollout.

## Phase 1 Design Artifacts

- Data model: `specs/001-enforce-dagger-compliance/data-model.md`
- Contracts: `specs/001-enforce-dagger-compliance/contracts/pipeline-compliance-contract.md`
- Quickstart validation guide: `specs/001-enforce-dagger-compliance/quickstart.md`

## Design Decisions

- Treat Dagger `@func()` entrypoints and reusable workflow interfaces as co-owned public contracts.
- Keep workflows as thin adapters; implementation behavior remains in Dagger module/pipeline packages.
- Use governance tests as release gates for contract integrity, defaults consistency, and security posture.
- Manage temporary non-compliance through explicit, time-bound exception records instead of ad-hoc bypasses.

## Project Structure

### Documentation (this feature)

```text
specs/001-enforce-dagger-compliance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── pipeline-compliance-contract.md
```

### Source Code (repository root)

```text
.github/
├── actions/
└── workflows/

packages/
├── dagger-module/src/
└── dagger-pipelines/src/

actions/
defaults.json
defaults.schema.json
```

**Structure Decision**: Keep existing monorepo layout and implement compliance strictly through workflow/action contract updates plus Dagger/governance tests in place.

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

| Contract surface                                         | Validation                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Workflow wiring and declared interfaces                  | `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflow-governance.test.ts`                                 |
| Dagger function naming/call alignment                    | `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-module-integration.test.ts`                           |
| Runtime defaults consistency                             | `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/standards-defaults.test.ts`                                  |
| Security behavior and permissions                        | `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/security-workflows.test.ts` and `src/audit-workflow.test.ts` |
| Spec artifact enforcement for pipeline-impacting changes | `.github/workflows/spec-governance.yaml` PR check                                                                         |

## Post-Design Constitution Check

All four gates remain satisfied by the planned design artifacts and validation strategy. No unresolved gate violations.

## Complexity Tracking

No constitutional violations requiring exception handling at planning time.

## Implementation Notes (Completed)

- Added feature-local compliance checklists:
  - `checklists/pipeline-inventory.md`
  - `checklists/compatibility-log.md`
  - `checklists/compliance-exceptions.md`
- Added pipeline change artifacts and registry updates:
  - `specs/pipeline-changes/001-enforce-dagger-compliance.md`
  - `specs/pipeline-changes/exceptions.md`
  - compatibility/migration/exception sections in `specs/pipeline-changes/template.md`
- Strengthened spec-governance enforcement and tests for compatibility classification and breaking-change guidance requirements.
- Added compatibility-focused release/publish test assertions and compliance script aliases in `packages/dagger-pipelines/package.json`.
- Added shared compliance result types and reusable Dagger invocation compliance evaluators in `packages/dagger-pipelines/src/config-types.ts` and `src/workflows.ts`, wired through `src/index.ts` and CLI startup validation.
