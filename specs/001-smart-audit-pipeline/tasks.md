# Tasks: Smart Audit Pipeline

**Input**: Design documents from `/specs/001-smart-audit-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Execution Rules

- Preserve `.github/workflows/audit.yaml` entrypoints, permissions, and inputs unless an explicit compatibility exception is approved.
- Preserve the `audit` `@func()` signature and top-level JSON envelope; only additive report changes are allowed.
- Pair every audit contract change in `packages/dagger-module/src/` with coverage in `packages/dagger-pipelines/src/`.
- Prefer pure logic in `packages/dagger-module/src/audit-logic.ts` so `packages/dagger-pipelines/src/audit-smart.test.ts` stays fixture-based and container-free.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the scaffolding and evidence files needed to implement and validate the feature safely.

- [x] T001 Create feature validation log for audit test and typecheck evidence in specs/001-smart-audit-pipeline/checklists/validation-log.md
- [x] T002 [P] Create downstream compatibility notes for unchanged workflow entrypoints in specs/001-smart-audit-pipeline/checklists/compatibility-notes.md
- [x] T003 [P] Create audit-specific type module scaffold in packages/dagger-module/src/audit-types.ts
- [x] T004 Create pure smart-audit helper module scaffold in packages/dagger-module/src/audit-logic.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add shared core primitives required by every user story.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [x] T005 Populate shared detection, scanner, and summary interfaces in packages/dagger-module/src/audit-types.ts
- [x] T006 Add optional `auditSummary` output typing to `PipelineReportOutputs` in packages/dagger-module/src/reporting.ts
- [x] T007 Add audit helper imports and private helper signatures in packages/dagger-module/src/index.ts

**Checkpoint**: Shared types and module seams are ready; user story work can begin.

---

## Phase 3: User Story 1 - Detect Repository Makeup Safely (Priority: P1) 🎯 MVP

**Goal**: Detect supported language families from repository signals and surface a useful fallback path without changing workflow inputs.

**Independent Test**: Run `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-smart.test.ts` and verify rust, mixed-language, and ambiguous fixtures produce the expected detected families, fallback warning behavior, and additive `scanFindings` keys.

### Tests for User Story 1

- [x] T008 [P] [US1] Add fixture-based detection and fallback coverage in packages/dagger-pipelines/src/audit-smart.test.ts

### Core for User Story 1

- [x] T009 [P] [US1] Implement signal-table detection and fallback derivation helpers in packages/dagger-module/src/audit-logic.ts
- [x] T010 [US1] Implement `Directory` probe bridging and `detectLanguageFamilies` in packages/dagger-module/src/index.ts

### Integration for User Story 1

- [x] T011 [US1] Emit fallback warnings and additive detected-family `scanFindings` outputs in packages/dagger-module/src/index.ts

**Checkpoint**: User Story 1 is independently testable and preserves a usable fallback audit path.

---

## Phase 4: User Story 2 - Aggregate Parallel Scanner Results (Priority: P2)

**Goal**: Run scanners independently, preserve partial results on failures, and rank the most actionable findings in one audit summary.

**Independent Test**: Run `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-smart.test.ts` and verify failure isolation, `overallStatus` derivation, severity ordering, gitleaks skip behavior, and enriched markdown rendering.

### Tests for User Story 2

- [x] T012 [P] [US2] Add aggregation, failure-isolation, and severity-ordering coverage in packages/dagger-pipelines/src/audit-smart.test.ts

### Core for User Story 2

- [x] T013 [P] [US2] Implement audit summary aggregation and top-finding sorting helpers in packages/dagger-module/src/audit-logic.ts
- [x] T014 [US2] Implement non-throwing semgrep and gitleaks runner helpers in packages/dagger-module/src/index.ts
- [x] T015 [US2] Implement `renderAuditIntelligenceSection` markdown enrichment in packages/dagger-module/src/index.ts

### Integration for User Story 2

- [x] T016 [US2] Refactor the `audit` orchestration to use `Promise.allSettled` and publish additive `auditSummary`/`scanFindings` outputs in packages/dagger-module/src/index.ts

**Checkpoint**: User Story 2 is independently testable and preserves scanner results even when one scanner fails.

---

## Phase 5: User Story 3 - Preserve Downstream Audit Contracts (Priority: P3)

**Goal**: Keep reusable workflow entrypoints, report surfaces, and consumer expectations backwards compatible while documenting the additive smart-audit behavior.

**Independent Test**: Run `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/audit-workflow.test.ts` and `pnpm --filter @gh-reusable/dagger-pipelines run test -- src/dagger-module-integration.test.ts`; both suites must pass with the unchanged workflow call shape and `audit` function name.

### Tests for User Story 3

- [x] T017 [P] [US3] Strengthen reusable workflow compatibility assertions for unchanged audit inputs, permissions, and report steps in packages/dagger-pipelines/src/audit-workflow.test.ts
- [x] T018 [P] [US3] Strengthen audit call-name and export alignment assertions in packages/dagger-pipelines/src/dagger-module-integration.test.ts

### Core for User Story 3

- [x] T019 [US3] Update additive output and failure-mode contract details in specs/001-smart-audit-pipeline/contracts/audit-function.md

### Integration for User Story 3

- [x] T020 [US3] Update end-to-end validation scenarios and report surface expectations in specs/001-smart-audit-pipeline/quickstart.md
- [x] T021 [US3] Record no-migration rollout and rollback guidance for downstream consumers in specs/001-smart-audit-pipeline/checklists/compatibility-notes.md

**Checkpoint**: User Story 3 is independently testable and documents the backwards-compatible rollout surface.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Reconcile design docs with the implemented shape and capture final validation evidence.

- [x] T022 [P] Reconcile design-decision notes with the final module boundaries in specs/001-smart-audit-pipeline/research.md
- [x] T023 [P] Refresh `AuditSummary` and `scanFindings` state documentation in specs/001-smart-audit-pipeline/data-model.md
- [x] T024 Run targeted smart-audit and compatibility test commands; record outcomes in specs/001-smart-audit-pipeline/checklists/validation-log.md
- [ ] T025 Run `pnpm --filter @gh-reusable/dagger-pipelines run test` and `pnpm run typecheck`; record final validation evidence in specs/001-smart-audit-pipeline/checklists/validation-log.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; MVP.
- **Phase 4 (US2)**: Depends on US1 detection outputs and Phase 2 shared types/helpers.
- **Phase 5 (US3)**: Depends on US2 report/output shape so compatibility docs and tests reflect the final additive behavior.
- **Phase 6 (Polish)**: Depends on completion of target user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational work; no dependency on later stories.
- **US2 (P2)**: Starts after US1 establishes detection and fallback behavior.
- **US3 (P3)**: Starts after US2 finalizes the smart-audit output surface.

### Within Each User Story

- Tests are authored before implementation changes in the same story.
- Pure helper logic lands before `packages/dagger-module/src/index.ts` orchestration changes.
- Contract and validation docs update only after the implementation surface is settled.

---

## Parallel Opportunities

- Setup: T002 and T003 can run in parallel after T001.
- US1: T008 and T009 can run in parallel after Phase 2.
- US2: T012 and T013 can run in parallel after US1 is stable.
- US3 tests: T017 and T018 can run in parallel.
- Polish docs: T022 and T023 can run in parallel before validation capture.

---

## Parallel Example: User Story 1

```bash
Task: "T008 [P] [US1] Add fixture-based detection and fallback coverage in packages/dagger-pipelines/src/audit-smart.test.ts"
Task: "T009 [P] [US1] Implement signal-table detection and fallback derivation helpers in packages/dagger-module/src/audit-logic.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T012 [P] [US2] Add aggregation, failure-isolation, and severity-ordering coverage in packages/dagger-pipelines/src/audit-smart.test.ts"
Task: "T013 [P] [US2] Implement audit summary aggregation and top-finding sorting helpers in packages/dagger-module/src/audit-logic.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T017 [P] [US3] Strengthen reusable workflow compatibility assertions in packages/dagger-pipelines/src/audit-workflow.test.ts"
Task: "T018 [P] [US3] Strengthen audit call-name and export alignment assertions in packages/dagger-pipelines/src/dagger-module-integration.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete US1 test + implementation tasks (T008-T011).
3. Validate fallback and detection behavior with the targeted `audit-smart.test.ts` scenarios.
4. Demo the unchanged workflow contract with smarter repository detection.

### Incremental Delivery

1. Ship MVP detection/fallback behavior (US1).
2. Add parallel scanner execution and consolidated summary rendering (US2).
3. Lock down compatibility tests and update contract/validation docs (US3).
4. Finish Polish validation capture and full-suite evidence.

### Parallel Team Strategy

1. One engineer handles Phase 1-2 scaffolding and shared audit types.
2. One engineer handles `audit-smart.test.ts` while another implements `audit-logic.ts` helpers.
3. After US2 lands, a separate engineer hardens compatibility tests and docs for US3.
