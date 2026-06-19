# Tasks: [PIPELINE CHANGE TITLE]

## Execution Rules

- Keep changes contract-safe for downstream repos.
- Pair any workflow/module contract change with tests in the same PR.
- Update docs/examples that communicate defaults or public behavior.

## Tasks

1. Update standards/runtime source
   - [ ] Update `defaults.json` / schema if needed
   - [ ] Wire affected code paths to defaults

2. Update workflow/action/module behavior
   - [ ] Implement YAML/action/module changes
   - [ ] Keep `with.call` and module function naming aligned

3. Add/adjust governance tests
   - [ ] Update workflow governance and integration tests
   - [ ] Add standards/security checks for new policy

4. Validate and document
   - [ ] Run targeted package tests/typechecks
   - [ ] Update README/skill references for changed contracts

5. Release propagation readiness
   - [ ] Record consumer migration notes (if any)
   - [ ] Confirm immutable ref strategy for downstream adoption
