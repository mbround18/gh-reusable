# Phase 0 Research: Enforce Dagger Pipeline Compliance

## Decision 1: Constitution/Gates Source

- **Decision**: Use active repository governance artifacts as constitutional gates for this feature because `.specify/memory/constitution.md` is not present.
- **Rationale**: Existing governance is already codified and enforced in CI through workflow tests and spec-governance checks.
- **Alternatives considered**:
  - Create a new constitution before planning (adds process overhead before this feature can proceed).
  - Keep gates undefined (unsafe for compliance rollout).

## Decision 2: Dagger Contract Enforcement Pattern

- **Decision**: Enforce contracts by validating workflow `with.call` usage against exported Dagger `@func()` names and by requiring module+call wiring.
- **Rationale**: This pattern already exists and directly protects downstream consumers from call-name drift and unsupported invocation styles.
- **Alternatives considered**:
  - Manual review-only checks (higher regression risk).
  - Runtime-only validation in end-to-end jobs (slower feedback and weaker static guarantees).

## Decision 3: Runtime Defaults Standardization

- **Decision**: Treat `defaults.json` + `defaults.schema.json` as the single source of truth for runtime standards, validated by standards tests.
- **Rationale**: Existing tests already block hardcoded drift and verify alignment across Dockerfiles, workflows, and setup actions.
- **Alternatives considered**:
  - Per-workflow inline defaults (drift-prone).
  - Multiple language-specific defaults files (higher maintenance complexity).

## Decision 4: Security and Permission Compliance

- **Decision**: Require explicit workflow `permissions` and preserve security workflow defaults/alert paths as mandatory compliance checks.
- **Rationale**: Security workflow tests assert required permission scopes and expected SARIF/audit behavior.
- **Alternatives considered**:
  - Depend on GitHub default token permissions (insufficient explicitness).
  - Document security expectations without automated tests (weaker enforcement).

## Decision 5: Validation Command Set

- **Decision**: Use workspace commands for broad validation and focused `@gh-reusable/dagger-pipelines` Vitest suites for contract-level enforcement.
- **Rationale**: This gives fast targeted checks for contract changes while preserving full-workspace confidence before release.
- **Alternatives considered**:
  - Run only full-workspace test jobs (slower iteration loop).
  - Run only targeted tests (risk of missing cross-package regressions).
