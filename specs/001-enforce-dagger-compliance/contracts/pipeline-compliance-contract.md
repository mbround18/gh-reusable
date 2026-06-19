# Pipeline Compliance Contract

This contract defines externally visible behavior that must remain stable (or explicitly versioned as breaking) when enforcing Dagger pipeline compliance.

## 1) Workflow Interface Contract

- Reusable workflows MUST declare and use all required inputs/secrets.
- Workflow contract changes MUST be classified as:
  - `compatible` (non-breaking), or
  - `breaking` (requires explicit communication and versioning plan).
- Pipeline-impacting PRs MUST include this classification in `specs/pipeline-changes/*.md`.
- Workflows MUST keep explicit `permissions` blocks with least-privilege scopes.

## 2) Dagger Invocation Contract

- Workflow Dagger invocations MUST use `module` + `call` wiring.
- Legacy wrapper `verb/args` style is not allowed for compliant pipelines.
- `call` function names MUST align with kebab-case of exported Dagger module `@func()` names.

## 3) Runtime Defaults Contract

- Standards-critical runtime values MUST be sourced from `defaults.json`.
- `defaults.schema.json` MUST remain aligned with `defaults.json`.
- Hardcoded runtime literals that diverge from standards are non-compliant.

## 4) Compliance Evaluation Contract

- Every pipeline-impacting change MUST produce compliance evaluation evidence in CI.
- A failed evaluation blocks release unless an approved, time-bound exception exists.
- Exceptions MUST include owner, expiration, and remediation commitments.

## 5) Validation Contract (Required Checks)

- Workflow governance checks
- Dagger module integration checks
- Standards defaults checks
- Security/audit workflow checks
- Spec governance enforcement for pipeline-impacting PRs

## Versioning & Compatibility

- Default expectation: non-breaking for existing compliant consumers.
- If breaking behavior is unavoidable, change owners MUST:
  1. classify the change as breaking,
  2. publish migration guidance,
  3. communicate rollout/rollback steps before release,
  4. document any temporary waiver in `specs/pipeline-changes/exceptions.md` with owner, expiry, and remediation.
