# Changelog Action

This action generates a changelog from commits since the last tag. It includes emojis and formatting to make the changelog look fantastic. Optionally, it can commit the changelog to the current branch.

## Inputs

- `path`: Path to the changelog file. Default is `CHANGELOG.md`.
- `write`: Whether to commit the changelog to the current branch. Default is `false`.
- `version`: Version to use for the changelog. Default is an empty string.
- `token`: GitHub token for authentication. This is required to allow writing to the branch.

## Outputs

None.

## Example Usage

```yaml
name: Generate Changelog
on:
  push:
    tags:
      - "*"
  workflow_dispatch:

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - name: Generate Changelog
        uses: ./actions/changelog
        with:
          path: "CHANGELOG.md"
          write: true
          version: "v1.0.0"
          token: ${{ secrets.GITHUB_TOKEN }}
```
