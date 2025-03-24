# GH Reusable Actions and Workflows

Welcome to the **GH Reusable** repository! This repository contains a collection of reusable GitHub Actions and Workflows designed to streamline your CI/CD pipelines and automate common tasks in your projects.

## Overview

- **Reusable Actions**: Located in `actions/<action-name>`. Each action is self-contained and comes with its own `README.md` detailing its purpose and usage.
- **Reusable Workflows**: Located in `.github/workflows/<workflow-name>`. These are predefined workflows that can be included in your repositories.

> **Note**: Any workflow prefixed with `test-` is intended for internal testing purposes and should **not** be used outside this repository.

## Catalog

| Action Name                  | Description                                                                                                                         | Link                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Docker Release Workflow      | Automates the process of building and releasing Docker images.                                                                      | [Link](#docker-release-workflow)      |
| Rust Build and Test Workflow | Automates the process of building and testing Rust projects.                                                                        | [Link](#rust-build-and-test-workflow) |
| Ensure Repository Action     | Ensures that the repository the action or workflow is running on is a known element.                                                | [Link](#ensure-repository-action)     |
| Install CLI Action           | Downloads and installs a CLI from a GitHub release into the `${GITHUB_ACTION_PATH}/bin` directory.                                  | [Link](#install-cli-action)           |
| Semver Action                | Increments the base or last tag by the increment or version.                                                                        | [Link](#semver-action)                |
| Setup Rust Action            | Sets up a Rust toolchain, installs additional components and targets, caches Cargo dependencies, and installs specified CLI crates. | [Link](#setup-rust-action)            |

## Getting Started

### Using Reusable Actions

To use any of the actions provided:

1. **Review the Action**: Navigate to `actions/<action-name>/README.md` to understand the action's functionality and required inputs.
2. **Reference the Action**: In your workflow file, use the `uses` keyword to include the action:

   ```yaml
   steps:
     - name: Use Reusable Action
       uses: mbround18/gh-reusable/actions/<action-name>@v0.0.5
       with:
         # action inputs
   ```

   Replace `<action-name>` with the name of the action and `v0.0.5` with the tag or commit SHA you wish to use.

### Using Reusable Workflows

To include a reusable workflow:

1. **Reference the Workflow**: In your workflow file, use the `uses` keyword under `jobs`:

   ```yaml
   jobs:
     my_job:
       uses: mbround18/gh-reusable/.github/workflows/<workflow-name>.yaml@v0.0.5
       with:
         # workflow inputs
   ```

   Replace `<workflow-name>` with the workflow's filename (excluding any `test-` prefixed workflows) and `v0.0.5` with the desired tag or commit SHA.

## Docker Release Workflow

The Docker Release Workflow automates the process of building and releasing Docker images. It supports releasing to both DockerHub and GitHub Container Registry (GHCR).

### Usage

To use the Docker Release Workflow, reference it in your workflow file:

```yaml
jobs:
  docker-release:
    uses: mbround18/gh-reusable/.github/workflows/docker-release.yaml@v0.0.5
    with:
      image: "mbround18/example"
      canary_label: "canary"
      dockerfile: "./Dockerfile"
      ghcr: true
      ghcr_username: "mbround18"
      dockerhub_username: "mbround18"
    secrets:
      DOCKER_TOKEN: ${{ secrets.DOCKER_TOKEN }}
      GHCR_TOKEN: ${{ secrets.GHCR_TOKEN }}
```

### Inputs

| Name                 | Description                | Required | Default             |
| -------------------- | -------------------------- | -------- | ------------------- |
| `image`              | Image Name                 | Yes      | `mbround18/example` |
| `canary_label`       | Canary label for PR builds | No       | `canary`            |
| `dockerfile`         | Path to the Dockerfile     | No       | `./Dockerfile`      |
| `ghcr`               | Release to GHCR?           | No       | `false`             |
| `ghcr_username`      | Username for GHCR          | No       | `mbround18`         |
| `dockerhub_username` | Username for DockerHub     | No       | `mbround18`         |

### Secrets

| Name           | Description                     | Required |
| -------------- | ------------------------------- | -------- |
| `DOCKER_TOKEN` | DockerHub token                 | Yes      |
| `GHCR_TOKEN`   | GitHub Container Registry token | No       |

## Rust Build and Test Workflow

The Rust Build and Test Workflow automates the process of building and testing Rust projects. It supports specifying toolchains, components, and additional compilation targets.

### Usage

To use the Rust Build and Test Workflow, reference it in your workflow file:

```yaml
jobs:
  rust-build-and-test:
    uses: mbround18/gh-reusable/.github/workflows/rust-build-n-test.yml@v0.0.5
    with:
      toolchain: "stable"
      components: "clippy,rustfmt"
      target: "wasm32-unknown-unknown"
```

### Inputs

| Name         | Description                                                 | Required | Default          |
| ------------ | ----------------------------------------------------------- | -------- | ---------------- |
| `toolchain`  | Rust toolchain to use (e.g., stable, nightly)               | No       | `stable`         |
| `components` | Comma-separated list of Rust components to install          | No       | `clippy,rustfmt` |
| `target`     | Comma-separated list of additional Rust compilation targets | No       | `""`             |

## Ensure Repository Action

The Ensure Repository Action ensures that the repository the action or workflow is running on is a known element.

### Usage

To use the Ensure Repository Action, reference it in your workflow file:

```yaml
jobs:
  ensure-repository:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Repo is mbround18/gh-reusable
        uses: mbround18/gh-reusable/actions/ensure-repository@v0.0.5
```

### Inputs

| Name         | Description                                       | Required | Default                 |
| ------------ | ------------------------------------------------- | -------- | ----------------------- |
| `repository` | Specific repository (e.g., mbround18/gh-reusable) | Yes      | `mbround18/gh-reusable` |

## Install CLI Action

The Install CLI Action downloads and installs a CLI from a GitHub release into the `${GITHUB_ACTION_PATH}/bin` directory.

### Usage

To use the Install CLI Action, reference it in your workflow file:

```yaml
jobs:
  install-cli:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Install CLI
        uses: mbround18/gh-reusable/actions/install-cli@v0.0.5
        with:
          repository: "owner/repo" # e.g., trunk-rs/trunk
          version: "latest" # Optional: specify version or use 'latest'
          asset: "cli-%VERSION%-linux-amd64.tar.gz" # Replace with the actual asset pattern
          override-name: "my-cli" # Optional: rename the installed CLI
```

### Inputs

| Name            | Description                                                                                        | Required | Default                        |
| --------------- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `repository`    | GitHub repository in the format `'owner/repo'` (e.g., `'trunk-rs/trunk'`).                         | Yes      | N/A                            |
| `version`       | Version of the release to install (e.g., `'v1.0.0'`). If not provided, the latest release is used. | No       | `'latest'`                     |
| `asset`         | Asset file name pattern with `%VERSION%` placeholder (e.g., `'cli-%VERSION%-linux-amd64.tar.gz'`). | Yes      | N/A                            |
| `override-name` | Optional. Rename the CLI binary to this name.                                                      | No       | `""` (default name from asset) |
| `github-token`  | GitHub token for API requests (defaults to the automatic `${{ github.token }}`).                   | No       | `${{ github.token }}`          |

## Semver Action

The Semver Action increments the base or last tag by the increment or version.

### Usage

To use the Semver Action, reference it in your workflow file:

```yaml
jobs:
  semver:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Increment version
        uses: mbround18/gh-reusable/actions/semver@v0.0.5
        with:
          base: "" # Optional: specify base version or leave empty to use the last tag
          increment: "patch" # Optional: specify increment (major, minor, patch)
          major-label: "major" # Optional: specify label to identify a major increment
          minor-label: "minor" # Optional: specify label to identify a minor increment
          patch-label: "patch" # Optional: specify label to identify a patch increment
```

### Inputs

| Name          | Description                                                             | Required | Default |
| ------------- | ----------------------------------------------------------------------- | -------- | ------- |
| `base`        | Base version to start from. If not provided, the last tag will be used. | No       | `""`    |
| `increment`   | Increment value (major, minor, patch).                                  | No       | `patch` |
| `major-label` | Label to identify a major increment.                                    | No       | `major` |
| `minor-label` | Label to identify a minor increment.                                    | No       | `minor` |
| `patch-label` | Label to identify a patch increment.                                    | No       | `patch` |

## Setup Rust Action

The Setup Rust Action sets up a Rust toolchain, installs additional components and targets, caches Cargo dependencies, and installs specified CLI crates.

### Usage

To use the Setup Rust Action, reference it in your workflow file:

```yaml
jobs:
  setup-rust:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Rust
        uses: mbround18/gh-reusable/actions/setup-rust@v0.0.5
        with:
          toolchain: "stable"
          components: "clippy,rustfmt"
          target: "wasm32-unknown-unknown"
          crates: "wasm-pack,trunk"
```

### Inputs

| Name         | Description                                                 | Required | Default  |
| ------------ | ----------------------------------------------------------- | -------- | -------- |
| `toolchain`  | Rust toolchain to use (e.g., stable, nightly)               | No       | `stable` |
| `components` | Comma-separated list of Rust components to install          | No       | `""`     |
| `target`     | Comma-separated list of additional Rust compilation targets | No       | `""`     |
| `crates`     | Comma-separated list of CLI crates to install               | No       | `""`     |

## Contributing

We welcome contributions! To contribute:

1. **Fork the Repository**: Click the "Fork" button at the top-right corner of this page.
2. **Create a Branch**: Use a descriptive name for your branch (e.g., `feature/new-action` or `fix/issue-123`).
3. **Make Changes**: Implement your feature or fix and update/add documentation as needed.
4. **Submit a Pull Request**: Open a pull request with a clear description of your changes.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).
