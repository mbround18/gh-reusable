# GH Reusable Actions and Workflows

Welcome to the **GH Reusable** repository! This repository contains a collection of reusable GitHub Actions and Workflows designed to streamline your CI/CD pipelines and automate common tasks in your projects.

## Overview

- **Reusable Actions**: Located in `actions/<action-name>`. Each action is self-contained and comes with its own `README.md` detailing its purpose and usage.
- **Reusable Workflows**: Located in `.github/workflows/<workflow-name>`. These are predefined workflows that can be included in your repositories.

> **Note**: Any workflow prefixed with `test-` is intended for internal testing purposes and should **not** be used outside this repository.

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
            <td>Rust Build and Test</td>
            <td>
                <details>
                    <summary>Click to see example.</summary>
                <pre>
<code>
jobs:
  example:
    uses: mbround18/gh-reusable/.github/workflows/rust-build-n-test.yml@v0.0.1
    with:
      components: &#34;clippy rustfmt&#34; # Optional, Comma-separated list of Rust components to install (e.g., rustfmt, clippy).
      target: &#34;&#34;                   # Optional, Comma-separated list of additional Rust compilation targets.
      toolchain: &#34;stable&#34;          # Optional, Rust toolchain to use (e.g., stable, nightly, beta).
    </code>
                </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>Docker Release Workflow</td>
            <td>
                <details>
                    <summary>Click to see example.</summary>
                <pre>
<code>
jobs:
  example:
    uses: mbround18/gh-reusable/.github/workflows/docker-release.yaml@v0.0.1
    with:
      image: &#34;mbround18/example&#34;      # Required, Image Name
      canary_label: &#34;canary&#34;          # Optional, 
      compose: &#34;false&#34;                # Optional, Want us to pull information from a docker-compose file?
      context: &#34;.&#34;                    # Optional, Build context
      dockerfile: &#34;./Dockerfile&#34;      # Optional, Dockerfile
      dockerhub_username: &#34;mbround18&#34; # Optional, Who to log into dockerhub as.
      ghcr: &#34;false&#34;                   # Optional, Release to GHCR?
      ghcr_username: &#34;mbround18&#34;      # Optional, Who to log into ghcr as.zs
      semver_prefix: &#34;&#34;               # Optional, Prefixer for semver, use this if you publish multiple artifacts like example-0.0.0
      working-directory: &#34;.&#34;          # Optional, Working directory for the action
    </code>
                </pre>
                </details>
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
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use setup-rust action
    uses: mbround18/gh-reusable/actions/setup-rust
    with:
      crates: &#34;&#34;          # Required, Comma-separated list of CLI crates to install (e.g., trunk, wasm-bindgen).
      components: &#34;&#34;      # Optional, Comma-separated list of Rust components to install (e.g., rustfmt, clippy).
      target: &#34;&#34;          # Optional, Comma-separated list of additional Rust compilation targets.
      toolchain: &#34;stable&#34; # Optional, Rust toolchain to use (e.g., stable, nightly, beta).
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>semver</td>
            <td>Increments the base or last tag by the increment or version, supports custom prefixes like chart-name-1.2.3.</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use semver action
    uses: mbround18/gh-reusable/actions/semver
    with:
      base: &#34;&#34;                     # Optional, Base version to start from. If not provided, the last matching tag will be used.
      increment: &#34;patch&#34;           # Optional, Increment value (major, minor, patch). If not provided, will infer from PR or commit labels.
      major-label: &#34;major&#34;         # Optional, Label to identify a major increment (default: &#39;major&#39;).
      minor-label: &#34;minor&#34;         # Optional, Label to identify a minor increment (default: &#39;minor&#39;).
      patch-label: &#34;patch&#34;         # Optional, Label to identify a patch increment (default: &#39;patch&#39;).
      prefix: &#34;&#34;                   # Optional, Optional prefix used to filter and build tag versions. Example: &#39;chart-name-&#39; -&gt; chart-name-1.2.3
      token: &#34;${{ github.token }}&#34; # Optional, GitHub token for authentication with GraphQL API.
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>install-cli</td>
            <td>Download and install a CLI from a GitHub release into GITHUB_ACTION_PATH/bin.</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use install-cli action
    uses: mbround18/gh-reusable/actions/install-cli
    with:
      asset: &#34;&#34;                           # Required, Asset file name pattern with %VERSION% placeholder (e.g., &#39;cli-%VERSION%-linux-amd64.tar.gz&#39;).
      repository: &#34;&#34;                      # Required, GitHub repository in the format &#39;owner/repo&#39; (e.g., &#39;trunk-rs/trunk&#39;).
      github-token: &#34;${{ github.token }}&#34; # Optional, GitHub token for API requests.
      override-name: &#34;&#34;                   # Optional, Optional. Rename the CLI binary to this name.
      version: &#34;latest&#34;                   # Optional, Version of the release to install (default is latest).
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>graphql</td>
            <td>Executes a GraphQL query or mutation using provided inputs</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use graphql action
    uses: mbround18/gh-reusable/actions/graphql
    with:
      query: &#34;&#34;                             # Required, Inline GraphQL query/mutation or a path to a file containing the query
      token: &#34;&#34;                             # Required, GitHub token for authenticating the API call
      args: &#34;&#34;                              # Optional, Comma or newline separated key=value pairs for query variables
      url: &#34;https://api.github.com/graphql&#34; # Optional, GraphQL endpoint URL; defaults to GitHub GraphQL API
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>github-catalog</td>
            <td>Generates a GitHub catalog of reusable workflows and actions, and inserts HTML tables into README.md.</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use github-catalog action
    uses: mbround18/gh-reusable/actions/github-catalog
    with:
      token: &#34;${{ github.token }}&#34; # Required, GitHub token with write access to the repository
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>ensure-repository</td>
            <td>Ensures the repository that the action or workflow is running on is a known element.</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use ensure-repository action
    uses: mbround18/gh-reusable/actions/ensure-repository
    with:
      repository: &#34;mbround18/gh-reusable&#34; # Required, Specific repository (eg: mbround18/gh-reusable)
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>docker-facts</td>
            <td>Extracts dockerfile, context, and build args from docker-compose.yml</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use docker-facts action
    uses: mbround18/gh-reusable/actions/docker-facts
    with:
      image: &#34;&#34;        # Required, Base image name (e.g., mbround18/steamcmd)
      canary_label: &#34;&#34; # Optional, Label to trigger canary pushes
      context: &#34;&#34;      # Optional, Default context path if not found in compose
      dockerfile: &#34;&#34;   # Optional, Default Dockerfile path if not found in compose
    </code>
                    </pre>
                </details>
            </td>
        </tr>
            <tr>
            <td>docker-build</td>
            <td>Build Docker images with build arguments, secrets, and multi-platform support</td>
            <td class="highlight highlight-source-yaml">
                <details>
                    <summary>Click here to see usage example.</summary>
                    <pre>
<code>
steps:
  - name: Use docker-build action
    uses: mbround18/gh-reusable/actions/docker-build
    with:
      context: &#34;.&#34;               # Required, Build context directory
      dockerfile: &#34;./Dockerfile&#34; # Required, Path to the Dockerfile relative to the context
      image: &#34;mbround18/test&#34;    # Required, Name of the image to be built
      version: &#34;latest&#34;          # Required, Image tag version
      canary_label: &#34;&#34;           # Optional, Label to trigger canary pushes
      platforms: &#34;linux/amd64&#34;   # Optional, Comma separated list of target platforms (e.g., linux/amd64,linux/arm64)
      push: &#34;false&#34;              # Optional, Whether to push the image
      registries: &#34;&#34;             # Optional, Comma separated list of registries to re-tag the image with
    </code>
                    </pre>
                </details>
            </td>
        </tr>
    </table>

<!-- GENERATED:GITHUB-CATALOG:STOP -->

## Contributing

We welcome contributions! To contribute:

1. **Fork the Repository**: Click the "Fork" button at the top-right corner of this page.
2. **Create a Branch**: Use a descriptive name for your branch (e.g., `feature/new-action` or `fix/issue-123`).
3. **Make Changes**: Implement your feature or fix and update/add documentation as needed.
4. **Submit a Pull Request**: Open a pull request with a clear description of your changes.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).
