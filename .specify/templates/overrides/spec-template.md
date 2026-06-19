# Feature Specification: [PIPELINE CHANGE TITLE]

## Summary

What is changing in workflows/actions/module behavior and why this change is needed.

## Motivation and Problem Statement

What pain or risk exists today, and what outcome this change guarantees.

## Scope

### In scope

- Concrete workflow/action/module/runtime changes included in this PR.

### Out of scope

- Explicitly list items intentionally excluded.

## Affected Contracts

- Reusable workflows impacted (inputs, secrets, outputs, behavior).
- Dagger `@func()` contracts impacted (names, args, result shape).
- Downstream compatibility expectations (breaking/non-breaking).

## Runtime and Defaults Impact

- Changes to `defaults.json` / runtime baselines (Node, Rust, Debian).
- Container base image changes and implications.

## Security and Permissions Impact

- Required workflow `permissions` changes with least-privilege rationale.
- Scanner/security behavior changes (audit, SARIF, dependency policies).

## Risks and Mitigations

- Key failure modes.
- Guards/rollback strategy for each major risk.

## Validation Plan

- Targeted tests and governance checks that prove this change.
- How downstream consumer compatibility is validated.

## Rollout and Rollback

- How this should be released (tag/sha strategy).
- Exact rollback procedure if regressions are found.
