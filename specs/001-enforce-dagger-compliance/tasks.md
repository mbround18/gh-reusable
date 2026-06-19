# Tasks: Enforce Dagger Pipeline Compliance

**Input**: Design documents from `/specs/001-enforce-dagger-compliance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Rules

- Keep changes contract-safe for downstream repositories.
- Pair workflow/module contract changes with governance tests in the same PR.
- Keep standards defaults centralized in `defaults.json` and `defaults.schema.json`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish implementation scaffolding and compliance tracking artifacts.

- [x] T001 Create pipeline compliance inventory for this feature in specs/001-enforce-dagger-compliance/checklists/pipeline-inventory.md
- [x] T002 Create compatibility classification log template in specs/001-enforce-dagger-compliance/checklists/compatibility-log.md
- [x] T003 [P] Create exception record template with owner/expiry/remediation fields in specs/001-enforce-dagger-compliance/checklists/compliance-exceptions.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared compliance primitives required by all user stories.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [x] T004 Define shared compliance rule/config types in packages/dagger-pipelines/src/config-types.ts
- [x] T005 [P] Add compliance evaluation helper exports in packages/dagger-pipelines/src/index.ts
- [x] T006 [P] Add shared workflow parsing and contract-assertion utilities in packages/dagger-pipelines/src/workflows.ts
- [x] T007 Wire CLI entrypoints to use shared compliance evaluation primitives in packages/dagger-pipelines/src/cli.ts
- [x] T008 Document enforcement workflow and validation command matrix in specs/001-enforce-dagger-compliance/quickstart.md

**Checkpoint**: Shared compliance primitives are ready; user stories can proceed.

---

## Phase 3: User Story 1 - Maintain Consistent Pipeline Behavior (Priority: P1) 🎯 MVP

**Goal**: Enforce one Dagger-compliant pipeline standard and block drift.

**Independent Test**: Run workflow governance, Dagger integration, defaults, and security suites; all compliance checks must pass and non-compliant fixtures must fail.

### Tests for User Story 1

- [x] T009 [P] [US1] Expand workflow contract assertions for inputs/secrets/permissions in packages/dagger-pipelines/src/workflow-governance.test.ts
- [x] T010 [P] [US1] Add Dagger module+call alignment and kebab-case call-name checks in packages/dagger-pipelines/src/dagger-module-integration.test.ts
- [x] T011 [P] [US1] Add standards drift checks for defaults source-of-truth enforcement in packages/dagger-pipelines/src/standards-defaults.test.ts
- [x] T012 [P] [US1] Add least-privilege/security behavior checks for reusable workflows in packages/dagger-pipelines/src/security-workflows.test.ts
- [x] T013 [P] [US1] Add audit workflow compliance checks for pipeline-impacting changes in packages/dagger-pipelines/src/audit-workflow.test.ts

### Implementation for User Story 1

- [x] T014 [US1] Implement workflow compliance assertions for declared contract usage in packages/dagger-pipelines/src/workflows.ts
- [x] T015 [US1] Enforce Dagger invocation contract (`module` + `call`, no `verb/args`) in packages/dagger-pipelines/src/workflows.ts
- [x] T016 [US1] Align exported Dagger function names and contract metadata in packages/dagger-module/src/index.ts
- [x] T017 [US1] Normalize standards-critical runtime defaults in defaults.json
- [x] T018 [US1] Align runtime defaults schema constraints with defaults values in defaults.schema.json
- [x] T019 [P] [US1] Update reusable workflow permission blocks and Dagger call wiring in .github/workflows/pnpm-build-n-test.yaml
- [x] T020 [P] [US1] Update reusable workflow permission blocks and Dagger call wiring in .github/workflows/python-build-n-test.yaml
- [x] T021 [P] [US1] Update reusable workflow permission blocks and Dagger call wiring in .github/workflows/rust-build-n-test.yaml

**Checkpoint**: User Story 1 is independently testable and enforces consistent compliant pipeline behavior.

---

## Phase 4: User Story 2 - Protect Downstream Consumers (Priority: P2)

**Goal**: Preserve consumer-facing contract compatibility and require explicit compatibility classification.

**Independent Test**: Validate compatibility-focused governance tests and confirm breaking changes require explicit classification, migration notes, and rollout/rollback guidance.

### Tests for User Story 2

- [x] T022 [P] [US2] Add consumer-compatibility assertions for release workflows in packages/dagger-pipelines/src/release-workflows.test.ts
- [x] T023 [P] [US2] Add publish workflow contract-compatibility assertions in packages/dagger-pipelines/src/publish-workflow.test.ts
- [x] T024 [P] [US2] Enforce spec-governance checks for compatibility classification evidence in packages/dagger-pipelines/src/spec-governance-workflow.test.ts

### Implementation for User Story 2

- [x] T025 [US2] Enforce compatibility classification and required migration metadata in .github/workflows/spec-governance.yaml
- [x] T026 [US2] Add downstream migration/rollback guidance for contract changes in specs/001-enforce-dagger-compliance/contracts/pipeline-compliance-contract.md
- [x] T027 [US2] Document maintainer workflow for compatible vs breaking pipeline updates in specs/001-enforce-dagger-compliance/quickstart.md
- [x] T028 [US2] Publish repository-level compliance rollout guidance for consumers in README.md

**Checkpoint**: User Story 2 is independently testable and protects downstream consumers from unclassified contract breaks.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency checks and cross-story hardening.

- [x] T029 [P] Reconcile feature implementation notes with executed tasks in specs/001-enforce-dagger-compliance/plan.md
- [x] T030 [P] Verify quickstart command matrix and expected outcomes reflect final checks in specs/001-enforce-dagger-compliance/quickstart.md
- [x] T031 Run full workspace validation and record pass/fail evidence in specs/001-enforce-dagger-compliance/checklists/pipeline-inventory.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; MVP.
- **Phase 4 (US2)**: Depends on Phase 2 and integrates with US1 contract outputs.
- **Phase 5 (Polish)**: Depends on completion of target user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational work; no dependency on US2.
- **US2 (P2)**: Starts after foundational work; depends on US1 compliance primitives and contract artifacts.

### Within Each User Story

- Test updates first (expected to fail before implementation fixes).
- Contract/parsing changes before workflow file rewiring.
- Defaults/schema updates before cross-workflow validation.

---

## Parallel Opportunities

- Setup: T003 can run parallel with T001-T002.
- Foundational: T005 and T006 can run parallel after T004.
- US1 tests: T009-T013 can run parallel.
- US1 workflow rewiring: T019-T021 can run parallel after T014-T018.
- US2 tests: T022-T024 can run parallel.
- Polish: T029 and T030 can run parallel before T031.

---

## Parallel Example: User Story 1

```bash
Task: "T009 [US1] Expand workflow contract assertions in packages/dagger-pipelines/src/workflow-governance.test.ts"
Task: "T010 [US1] Add Dagger call-name alignment checks in packages/dagger-pipelines/src/dagger-module-integration.test.ts"
Task: "T011 [US1] Add defaults drift checks in packages/dagger-pipelines/src/standards-defaults.test.ts"
Task: "T012 [US1] Add security workflow checks in packages/dagger-pipelines/src/security-workflows.test.ts"
Task: "T013 [US1] Add audit checks in packages/dagger-pipelines/src/audit-workflow.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete US1 test + implementation tasks (T009-T021).
3. Validate US1 independently with targeted governance suites.
4. Demo/release MVP compliance gate behavior.

### Incremental Delivery

1. Ship MVP (US1) for uniform compliance enforcement.
2. Add US2 compatibility protections and migration governance.
3. Finish Polish phase and full-workspace validation.

### Parallel Team Strategy

1. One engineer handles foundational primitives (T004-T008).
2. One engineer handles US1 governance tests while another updates workflow wiring.
3. One engineer handles US2 governance/test updates after US1 primitives stabilize.
