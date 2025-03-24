# Semver Action

This GitHub Action increments the base or last tag by the increment or version.

## Usage

To use this action in your workflow, add the following steps to your GitHub Actions workflow file.

```yaml
jobs:
  semver:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Increment version
        id: semver
        uses: mbround18/gh-reusable/actions/semver@v0.0.5
        with:
          base: "" # Optional: specify base version or leave empty to use the last tag
          increment: "patch" # Optional: specify increment (major, minor, patch)
          major-label: "major" # Optional: specify label to identify a major increment
          minor-label: "minor" # Optional: specify label to identify a minor increment
          patch-label: "patch" # Optional: specify label to identify a patch increment

      - name: Output
        run: echo "${{ steps.semver.outputs.new_version }}"
```

## Inputs

| Name          | Description                                                             | Required | Default |
| ------------- | ----------------------------------------------------------------------- | -------- | ------- |
| `base`        | Base version to start from. If not provided, the last tag will be used. | No       | `""`    |
| `increment`   | Increment value (major, minor, patch).                                  | No       | `patch` |
| `major-label` | Label to identify a major increment.                                    | No       | `major` |
| `minor-label` | Label to identify a minor increment.                                    | No       | `minor` |
| `patch-label` | Label to identify a patch increment.                                    | No       | `patch` |

## Logic

### Looking up the last tag

If the `base` input is not provided, the action will look up the last tag in the repository using the `git describe --tags --abbrev=0` command.

### Incrementing the base or last tag

The action will increment the base or last tag by the specified increment value. If the `increment` input is not provided, the action will use the labels of the last commit or PR to determine the increment value. The increment value can be `major`, `minor`, or `patch`.
