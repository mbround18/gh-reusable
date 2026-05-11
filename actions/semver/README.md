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
          increment: "" # Optional: specify increment (major, minor, patch); empty infers from labels
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
| `increment`   | Increment value (major, minor, patch). Empty infers from labels.        | No       | `""` |
| `major-label` | Label to identify a major increment.                                    | No       | `major` |
| `minor-label` | Label to identify a minor increment.                                    | No       | `minor` |
| `patch-label` | Label to identify a patch increment.                                    | No       | `patch` |

## Logic

### Looking up the last tag

If the `base` input is not provided, the action will look up the last tag in the repository using GitHub's GraphQL API.

### Incrementing the base or last tag

The action increments by `major`, `minor`, or `patch`.

When `increment` is empty, inference order is:
1. PR labels (for `pull_request` events)
2. Labels on the associated PR for the pushed commit (for `push` events)
3. Branch-name heuristics:
   - `major`: `major`, `breaking`, `breaking-change`
   - `minor`: `feat`, `feature`, `minor`, `release/*`
   - `patch`: `fix`, `patch`, `hotfix`, `bugfix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`
4. Default fallback: `patch`

## Project Structure

The codebase is organized into the following structure:

```
actions/semver/
├── src/             # Source code
│   ├── index.js     # Main entry point
│   ├── version.js   # Version handling
│   ├── increment.js # Increment detection
│   └── tag.js       # Tag management
├── queries/         # GraphQL query files
│   ├── get_last_tag.gql
│   ├── pr_labels.gql
│   └── commit_associated_pr.gql
├── tests/           # Test files
│   ├── index.test.js
│   ├── version.test.js
│   ├── increment.test.js
│   └── tag.test.js
└── index.js         # Action entry point
```

## Development

### Installing Dependencies

```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```
