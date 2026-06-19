# Compatibility Notes: Smart Audit Pipeline

- `.github/workflows/audit.yaml` remains the stable reusable entrypoint.
- The `audit` Dagger function signature is unchanged.
- New audit intelligence is additive: `report.outputs.auditSummary`, extra numeric `scanFindings` keys, and an appended markdown section.
- PR comments, artifacts, and tag release summaries continue to read the same consolidated markdown output.
