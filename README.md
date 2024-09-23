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
       uses: mbround18/gh-reusable/actions/<action-name>@<version>
       with:
         # action inputs
   ```

   Replace `<action-name>` with the name of the action and `<version>` with the tag or commit SHA you wish to use.

### Using Reusable Workflows

To include a reusable workflow:

1. **Reference the Workflow**: In your workflow file, use the `uses` keyword under `jobs`:

   ```yaml
   jobs:
     my_job:
       uses: mbround18/gh-reusable/.github/workflows/<workflow-name>.yaml@<version>
       with:
         # workflow inputs
   ```

   Replace `<workflow-name>` with the workflow's filename (excluding any `test-` prefixed workflows) and `<version>` with the desired tag or commit SHA.

## Contributing

We welcome contributions! To contribute:

1. **Fork the Repository**: Click the "Fork" button at the top-right corner of this page.
2. **Create a Branch**: Use a descriptive name for your branch (e.g., `feature/new-action` or `fix/issue-123`).
3. **Make Changes**: Implement your feature or fix and update/add documentation as needed.
4. **Submit a Pull Request**: Open a pull request with a clear description of your changes.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).
