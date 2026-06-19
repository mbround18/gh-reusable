# Compatibility Classification Log

Track every pipeline contract change using this log.

## Entries

| Date       | Area                               | Classification | Consumer Impact                               | Migration Notes | Owner      |
| ---------- | ---------------------------------- | -------------- | --------------------------------------------- | --------------- | ---------- |
| 2026-06-19 | Spec governance + compliance tests | compatible     | Adds stronger validation; no contract removal | None required   | @mbround18 |

## Classification rules

- [x] `compatible` = additive or validation tightening without removing existing supported inputs/outputs.
- [x] `breaking` = removal/rename/behavioral change to public workflow/action/module contracts.
- [x] `breaking` entries require migration and rollback guidance in the linked pipeline-change spec.
