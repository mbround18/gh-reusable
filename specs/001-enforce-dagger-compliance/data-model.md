# Data Model: Enforce Dagger Pipeline Compliance

## Entity: PipelineComplianceStandard

- **Fields**
  - `id` (string, stable identifier; e.g., `dagger-compliance-v1`)
  - `version` (string, semver-style)
  - `rules` (array of rule identifiers)
  - `effectiveDate` (date)
  - `status` (enum: `draft`, `active`, `deprecated`)
- **Validation Rules**
  - `id` and `version` are required.
  - `rules` must include contract, defaults, and security rule families.
  - Only one `active` standard version at a time.

## Entity: PipelineContract

- **Fields**
  - `surface` (enum: `workflow`, `action`, `dagger-function`)
  - `name` (string)
  - `inputs` (map)
  - `secrets` (map)
  - `outputs` (map)
  - `compatibilityClass` (enum: `compatible`, `breaking`)
  - `consumerImpactNotes` (string)
- **Validation Rules**
  - Declared inputs/secrets must be referenced by the implementation.
  - Dagger workflow calls must map to exported `@func()` names.
  - Breaking changes require explicit classification and rollout communication.

## Entity: ComplianceEvaluation

- **Fields**
  - `pipelineRef` (string; workflow/action/module path)
  - `standardId` (string)
  - `runId` (string; CI execution reference)
  - `results` (map of rule → pass/fail/waived)
  - `overallStatus` (enum: `pass`, `fail`, `waived`)
  - `evaluatedAt` (datetime)
- **Validation Rules**
  - Every active pipeline must have an evaluation record before release.
  - `overallStatus=waived` requires a linked `ComplianceException`.

## Entity: ComplianceException

- **Fields**
  - `id` (string)
  - `pipelineRef` (string)
  - `reason` (string)
  - `owner` (string)
  - `approvedBy` (string)
  - `createdAt` (datetime)
  - `expiresAt` (datetime)
  - `remediationPlan` (string)
  - `status` (enum: `proposed`, `approved`, `expired`, `resolved`)
- **Validation Rules**
  - `owner`, `reason`, `expiresAt`, and `remediationPlan` are required.
  - `expiresAt` must be in the future when `status=approved`.
  - Expired exceptions cannot be used as active waivers.

## Relationships

- `PipelineComplianceStandard` 1→N `ComplianceEvaluation`
- `PipelineContract` 1→N `ComplianceEvaluation`
- `ComplianceException` 1→N `ComplianceEvaluation` (optional; only for waived results)

## State Transitions

### ComplianceEvaluation

- `pass` → `pass` (re-validation)
- `fail` → `pass` (after remediation)
- `fail` → `waived` (only with approved exception)
- `waived` → `pass` (exception remediated)

### ComplianceException

- `proposed` → `approved`
- `approved` → `resolved`
- `approved` → `expired`
- `expired` → `resolved` (after remediation completion)
