---
name: ci
description: >
  Knowledge of the gh-reusable CI system: reusable GitHub Actions workflows,
  composite actions, and the Dagger TypeScript module that backs them. Use when
  adding, modifying, or debugging CI in any repo that consumes gh-reusable,
  when wiring up a new workflow, or when working inside the gh-reusable repo itself.
compatibility: Designed for Claude Code. Requires access to the gh-reusable repository.
metadata:
  author: mbround18
  dagger-version: "v0.20.8"
  module: "github.com/mbround18/gh-reusable/packages/dagger-module@main"
  generated: "2026-05-18"
---

# gh-reusable CI skill

All CI logic runs through a [Dagger](https://dagger.io) TypeScript module at
`packages/dagger-module/src/index.ts`. Workflows are thin callers via the
`dagger-run` composite action. Full structured detail is in
[references/ci-manifest.json](references/ci-manifest.json).

**Dagger:** `v0.20.8` · **Module:** `github.com/mbround18/gh-reusable/packages/dagger-module@main`

## Architecture

```
.github/
  workflows/        reusable (workflow_call) + internal CI
  actions/
    dagger-run/     composite: warm engine + call module function
    discord-notify/ composite: curl Discord CI status embed
packages/
  dagger-module/
    src/
      index.ts      @func() methods — all pipeline logic
      types.ts      domain interfaces (SemverIncrement, StepResult …)
      reporting.ts  PipelineReporter + PipelineReport
      cache.ts      PipelineCache (S3/GHA)
skills/ci/
  SKILL.md          this file
  references/
    ci-manifest.json  machine-readable index of all workflows, actions, functions
```

## Composite actions

**`.github/actions/dagger-run`** — Warms the Dagger engine and executes a Dagger module function call.  
 Inputs: `call`, `module`, `cloud-token`  
 Outputs: `stdout`

**`.github/actions/discord-notify`** — Sends a CI status notification to a Discord webhook.  
 Inputs: `webhook-url`, `status`, `workflow`, `run-url`, `ref`

## Reusable workflows

Full input/secret details in [references/ci-manifest.json](references/ci-manifest.json).

| File                                                      | Name                           | Inputs (? = optional)                                                                                                                                                                                                     | Secrets (? = optional)                                                                                       |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`audit.yaml`](references/ci-manifest.json)               | Audit Workflow                 | runs-on?, semgrep_config?, include_gitleaks?, create_alerts?, track_release_summary?                                                                                                                                      | DAGGER_CLOUD_TOKEN?                                                                                          |
| [`docker-release.yaml`](references/ci-manifest.json)      | Docker Release Workflow        | image, context?, canary_label?, dockerfile?, ghcr?, ghcr_username?, dockerhub_username?, semver_prefix?, prepend_target?, target?, platforms?, download_artifact?, download_artifact_destination?, track_release_summary? | DOCKER_TOKEN, GHCR_TOKEN?, DAGGER_CLOUD_TOKEN?, DISCORD_WEBHOOK_URL?                                         |
| [`enforce-labels.yaml`](references/ci-manifest.json)      | Enforce PR Labels              | required_labels_any?, required_labels_any_description?, banned_labels?, runs-on?                                                                                                                                          | DAGGER_CLOUD_TOKEN?                                                                                          |
| [`publish.yaml`](references/ci-manifest.json)             | Publish                        | target, source?, registry?, chart?, tag?, version?, runs-on?                                                                                                                                                              | NPM_TOKEN?, CARGO_REGISTRY_TOKEN?, HELM_USERNAME?, HELM_PASSWORD?, DAGGER_CLOUD_TOKEN?, DISCORD_WEBHOOK_URL? |
| [`rust-binary-release.yaml`](references/ci-manifest.json) | Rust Binary Release            | build_command?, binary_paths_csv, archive_name?, toolchain?, components?, runs-on?                                                                                                                                        | GH_TOKEN, DAGGER_CLOUD_TOKEN?, DISCORD_WEBHOOK_URL?                                                          |
| [`rust-build-n-test.yaml`](references/ci-manifest.json)   | Rust Build and Test            | toolchain?, components?, target?, runs-on?                                                                                                                                                                                | DAGGER_CLOUD_TOKEN?                                                                                          |
| [`tagger.yaml`](references/ci-manifest.json)              | Reusable Tag Creation Workflow | prefix?, force?                                                                                                                                                                                                           | GH_TOKEN                                                                                                     |
| [`update-readme.yaml`](references/ci-manifest.json)       | Update README                  | runs-on?                                                                                                                                                                                                                  | —                                                                                                            |

## Internal CI workflows

- `internal-ci.yaml` — CI _(pull_request, push)_
- `test-code-matrix.yaml` — Test | Code Matrix _(pull_request, push)_
- `test-docker-release.yaml` — Test | Docker Release Workflow _(pull_request, push)_
- `test-graphql-action.yaml` — Test | GraphQL Query Default Branch _(push, pull_request)_
- `test-install-cli.yaml` — Test | Install CLI Action _(pull_request, push)_
- `test-rust-build-n-test.yaml` — Test | Rust Build and Test Workflow _(pull_request, push)_
- `test-semver.yaml` — Test | Semver Action _(pull_request, push)_
- `test-setup-rust.yaml` — Test | Setup Rust _(pull_request, push)_

## Dagger module functions

Full param types in [references/ci-manifest.json](references/ci-manifest.json).

| Function (kebab-case) | Params (? = optional)                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci`                  | source                                                                                                                                                                                                                                                                                                                                      |
| `enforce-pr-labels`   | labelsCsv?, requiredAnyCsv?, bannedCsv?, requiredAnyDescription?                                                                                                                                                                                                                                                                            |
| `notify-discord`      | webhookUrl, title, description?, color?, fieldsJson?, url?, footer?, username?                                                                                                                                                                                                                                                              |
| `rust-build-and-test` | source, toolchain?, components?, target?                                                                                                                                                                                                                                                                                                    |
| `audit`               | source, semgrepConfig?, includeGitleaks?                                                                                                                                                                                                                                                                                                    |
| `publish-npm`         | source, registry?, token?, tag?, version?, discordWebhook?                                                                                                                                                                                                                                                                                  |
| `publish-pnpm`        | source, registry?, token?, tag?, version?, discordWebhook?                                                                                                                                                                                                                                                                                  |
| `publish-yarn`        | source, registry?, token?, tag?, version?, discordWebhook?                                                                                                                                                                                                                                                                                  |
| `publish-rust-crate`  | source, token?, version?, registry?, discordWebhook?                                                                                                                                                                                                                                                                                        |
| `publish-helm-chart`  | source, chart?, registry?, username?, password?, version?, discordWebhook?                                                                                                                                                                                                                                                                  |
| `docker-release`      | source, image, context?, dockerfile?, target?, platforms?, tagsCsv?, registriesCsv?, semverPrefix?, semverIncrement?, prependTarget?, canaryLabel?, dockerhubUsername?, ghcrUsername?, forcePush?, dockerToken?, ghcrToken?, eventName?, ref?, refName?, headRef?, defaultBranch?, sha?, runUrl?, runNumber?, prLabelsCsv?, discordWebhook? |
| `ensure-repository`   | expectedRepository, repository?                                                                                                                                                                                                                                                                                                             |
| `graphql-query`       | query, args?, token?, url?                                                                                                                                                                                                                                                                                                                  |
| `install-cli`         | repository, asset, version?, overrideName?, token?                                                                                                                                                                                                                                                                                          |
| `setup-rust`          | source, toolchain?, components?, target?, crates?                                                                                                                                                                                                                                                                                           |
| `setup-node`          | source, nodeVersion?, packageManager?, installDeps?                                                                                                                                                                                                                                                                                         |
| `setup-go`            | source, goVersion?                                                                                                                                                                                                                                                                                                                          |
| `setup-ruby`          | source, rubyVersion?, bundleInstall?                                                                                                                                                                                                                                                                                                        |
| `setup-java`          | source, javaVersion?, distribution?                                                                                                                                                                                                                                                                                                         |
| `setup-terraform`     | source, terraformVersion?, useOpentofu?                                                                                                                                                                                                                                                                                                     |
| `setup-pulumi`        | source, pulumiVersion?, runtime?                                                                                                                                                                                                                                                                                                            |
| `rust-binary-release` | source, binaryPathsCsv, tag, ghToken, buildCommand?, archiveName?, toolchain?, components?, repository?, discordWebhook?                                                                                                                                                                                                                    |
| `compute-semver`      | tagsCsv?, base?, prefix?, increment?, prLabelsCsv?, branchName?, majorLabel?, minorLabel?, patchLabel?                                                                                                                                                                                                                                      |
| `docker-facts`        | source, image, version, registries?, dockerfile?, context?, canaryLabel?, forcePush?, withLatest?, target?, prependTarget?, eventName?, ref?, defaultBranch?, prLabelsCsv?                                                                                                                                                                  |
| `code-matrix`         | source                                                                                                                                                                                                                                                                                                                                      |

## Common patterns

### Call a Dagger function from a workflow step

```yaml
- uses: ./.github/actions/dagger-run
  with:
    call: >-
      rust-build-and-test
      --source=.
      --toolchain=stable
      --components=clippy,rustfmt
    cloud-token: ${{ secrets.DAGGER_CLOUD_TOKEN }}
```

Omit `module:` — the action defaults to the published remote ref.
Use `module: ./packages/dagger-module` only inside this repo (pre-merge CI).

### Call a reusable workflow from another repo

```yaml
jobs:
  build:
    uses: mbround18/gh-reusable/.github/workflows/rust-build-n-test.yaml@main
    secrets:
      DAGGER_CLOUD_TOKEN: ${{ secrets.DAGGER_CLOUD_TOKEN }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

### Discord notifications

Publish/release Dagger functions accept `--discord-webhook=${{ secrets.DISCORD_WEBHOOK_URL }}`.

For CI pass/fail embeds (no Dagger required):

```yaml
- if: always()
  uses: ./.github/actions/discord-notify
  with:
    webhook-url: ${{ secrets.DISCORD_WEBHOOK_URL }}
    status: ${{ job.status }}
    workflow: ${{ github.workflow }}
    run-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    ref: ${{ github.ref_name }}
```

### Release flow

```
push to main
  → tagger.yaml          compute-semver → git tag → gh release create
  → docker-release.yaml  triggered by tag push   → images published to DockerHub/GHCR
  → binary-release.yaml  triggered by release    → binaries zipped + uploaded
```

### Add a new Dagger function

1. Add `@func()` async method to `GhReusablePipelines` in `packages/dagger-module/src/index.ts`
2. Add any new interfaces to `packages/dagger-module/src/types.ts`
3. Wire into a reusable workflow if needed
4. Run `pnpm run generate:ci-skill` — regenerates this file and `references/ci-manifest.json`

### Secrets reference

| Secret                 | Scope                                         |
| ---------------------- | --------------------------------------------- |
| `DAGGER_CLOUD_TOKEN`   | All Dagger workflows (optional — cloud cache) |
| `DISCORD_WEBHOOK_URL`  | All publish/release/test workflows (optional) |
| `DOCKER_TOKEN`         | `docker-release.yaml`                         |
| `GHCR_TOKEN`           | `docker-release.yaml` when `ghcr: true`       |
| `NPM_TOKEN`            | `publish.yaml` node target                    |
| `CARGO_REGISTRY_TOKEN` | `publish.yaml` rust-crate target              |
| `GH_TOKEN`             | `tagger.yaml`, `rust-binary-release.yaml`     |
