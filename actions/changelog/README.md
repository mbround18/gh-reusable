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

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_TOKEN }}
          ref: main

      - name: Generate Changelog
        uses: ./actions/changelog
        with:
          path: "CHANGELOG.md"
          write: true
          version: "${{ github.ref_name	}}"
          token: ${{ secrets.GITHUB_TOKEN }}
```
