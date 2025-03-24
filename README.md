# GH Reusable Actions and Workflows

Welcome to the **GH Reusable** repository! This repository contains a collection of reusable GitHub Actions and Workflows designed to streamline your CI/CD pipelines and automate common tasks in your projects.

## Overview

- **Reusable Actions**: Located in `actions/<action-name>`. Each action is self-contained and comes with its own `README.md` detailing its purpose and usage.
- **Reusable Workflows**: Located in `.github/workflows/<workflow-name>`. These are predefined workflows that can be included in your repositories.

> **Note**: Any workflow prefixed with `test-` is intended for internal testing purposes and should **not** be used outside this repository.

<!-- GENERATED:GITHUB-CATALOG:START -->
<h3>Reusable Workflows</h3>
<table>
    <tr>
        <th>Name</th>
        <th>Description</th>
        <th>Workflow Name</th>
        <th>Usage</th>
    </tr>
        <tr>
        <td>rust-build-n-test.yml</td>
        <td></td>
        <td>Rust Build and Test</td>
        <td>
            <pre><code>uses: mbround18/gh-reusable/.github/workflows/rust-build-n-test.yml@v0.0.1</code></pre><strong>Optional Inputs:</strong><ul><li><code>toolchain</code></li><li><code>components</code></li><li><code>target</code></li></ul>
        </td>
    </tr>
    </table>

<h3>Reusable Actions</h3>
<table>
    <tr>
        <th>Name</th>
        <th>Description</th>
        <th>Usage</th>
    </tr>
        <tr>
        <td>setup-rust</td>
        <td>Sets up Rust toolchains, components, and additional CLI tools as needed.</td>
        <td>
            <pre><code>uses: ./actions/setup-rust</code></pre><strong>Required Inputs:</strong><ul><li><code>crates</code></li></ul><strong>Optional Inputs:</strong><ul><li><code>toolchain</code></li><li><code>components</code></li><li><code>target</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>semver</td>
        <td>Increments the base or last tag by the increment or version, supports custom prefixes like chart-name-1.2.3.</td>
        <td>
            <pre><code>uses: ./actions/semver</code></pre><strong>Optional Inputs:</strong><ul><li><code>token</code></li><li><code>base</code></li><li><code>prefix</code></li><li><code>increment</code></li><li><code>major-label</code></li><li><code>minor-label</code></li><li><code>patch-label</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>install-cli</td>
        <td>Download and install a CLI from a GitHub release into GITHUB_ACTION_PATH/bin.</td>
        <td>
            <pre><code>uses: ./actions/install-cli</code></pre><strong>Required Inputs:</strong><ul><li><code>repository</code></li><li><code>asset</code></li></ul><strong>Optional Inputs:</strong><ul><li><code>version</code></li><li><code>override-name</code></li><li><code>github-token</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>graphql</td>
        <td>Executes a GraphQL query or mutation using provided inputs</td>
        <td>
            <pre><code>uses: ./actions/graphql</code></pre><strong>Required Inputs:</strong><ul><li><code>query</code></li><li><code>token</code></li></ul><strong>Optional Inputs:</strong><ul><li><code>args</code></li><li><code>url</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>github-catalog</td>
        <td>Generates a GitHub catalog of reusable workflows and actions, and inserts HTML tables into README.md.</td>
        <td>
            <pre><code>uses: ./actions/github-catalog</code></pre><strong>Required Inputs:</strong><ul><li><code>token</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>ensure-repository</td>
        <td>Ensures the repository that the action or workflow is running on is a known element.</td>
        <td>
            <pre><code>uses: ./actions/ensure-repository</code></pre><strong>Required Inputs:</strong><ul><li><code>repository</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>docker-facts</td>
        <td>Extracts dockerfile, context, and build args from docker-compose.yml</td>
        <td>
            <pre><code>uses: ./actions/docker-facts</code></pre><strong>Required Inputs:</strong><ul><li><code>image</code></li></ul><strong>Optional Inputs:</strong><ul><li><code>dockerfile</code></li><li><code>context</code></li><li><code>canary_label</code></li></ul>
        </td>
    </tr>
        <tr>
        <td>docker-build</td>
        <td>Build Docker images with build arguments, secrets, and multi-platform support</td>
        <td>
            <pre><code>uses: ./actions/docker-build</code></pre><strong>Required Inputs:</strong><ul><li><code>image</code></li><li><code>dockerfile</code></li><li><code>context</code></li><li><code>version</code></li></ul><strong>Optional Inputs:</strong><ul><li><code>registries</code></li><li><code>push</code></li><li><code>canary_label</code></li><li><code>platforms</code></li></ul>
        </td>
    </tr>
    </table>

<!-- GENERATED:GITHUB-CATALOG:STOP -->

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

## Contributing

We welcome contributions! To contribute:

1. **Fork the Repository**: Click the "Fork" button at the top-right corner of this page.
2. **Create a Branch**: Use a descriptive name for your branch (e.g., `feature/new-action` or `fix/issue-123`).
3. **Make Changes**: Implement your feature or fix and update/add documentation as needed.
4. **Submit a Pull Request**: Open a pull request with a clear description of your changes.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).
