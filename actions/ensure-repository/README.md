# Ensure Repository Action

The Ensure Repository Action ensures that the repository the action or workflow is running on is a known element.

## Usage

To use the Ensure Repository Action, reference it in your workflow file:

```yaml
jobs:
  ensure-repository:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Repo is mbround18/gh-reusable
        uses: mbround18/gh-reusable/actions/ensure-repository@v0.0.5
```

## Inputs

| Name         | Description                                       | Required | Default                 |
| ------------ | ------------------------------------------------- | -------- | ----------------------- |
| `repository` | Specific repository (e.g., mbround18/gh-reusable) | Yes      | `mbround18/gh-reusable` |
