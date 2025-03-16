# Install CLI from GitHub

This GitHub Action downloads and installs a CLI from a GitHub release into the `${GITHUB_ACTION_PATH}/bin` directory.

## Usage

To use this action in your workflow, add the following steps to your GitHub Actions workflow file.

```yaml
jobs:
  install-cli:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Install CLI
        uses: mbround18/gh-reusable/actions/install-cli@v1
        with:
          repository: "owner/repo" # e.g., trunk-rs/trunk
          version: "latest" # Optional: specify version or use 'latest'
          asset: "cli-%VERSION%-linux-amd64.tar.gz" # Replace with the actual asset pattern
          override-name: "my-cli" # Optional: rename the installed CLI
```

## Inputs

| Name            | Description                                                                                        | Required | Default                        |
| --------------- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `repository`    | GitHub repository in the format `'owner/repo'` (e.g., `'trunk-rs/trunk'`).                         | Yes      | N/A                            |
| `version`       | Version of the release to install (e.g., `'v1.0.0'`). If not provided, the latest release is used. | No       | `'latest'`                     |
| `asset`         | Asset file name pattern with `%VERSION%` placeholder (e.g., `'cli-%VERSION%-linux-amd64.tar.gz'`). | Yes      | N/A                            |
| `override-name` | Optional. Rename the CLI binary to this name.                                                      | No       | `""` (default name from asset) |
| `github-token`  | GitHub token for API requests (defaults to the automatic `${{ github.token }}`).                   | No       | `${{ github.token }}`          |

## Example

```yaml
jobs:
  example-job:
    runs-on: ubuntu-latest
    steps:
      - name: Install trunk CLI
        uses: mbround18/gh-reusable/actions/install-cli@v1
        with:
          repository: "trunk-rs/trunk"
          version: "v0.13.0"
          asset: "trunk-%VERSION%-linux-amd64.tar.gz"
          override-name: "trunk"
```

In this example, the action downloads and installs version `v0.13.0` of the `trunk` CLI and renames the binary to `trunk`.
