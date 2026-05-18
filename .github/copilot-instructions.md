# Copilot instructions for `gh-reusable`

## Build, test, and lint commands

Run from repository root unless noted.

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run typecheck
```

When you need package-scoped runs (faster than whole-workspace):

```bash
# Full tests in one package
pnpm --filter @gh-reusable/dagger-pipelines run test
pnpm --filter ./packages/dagger-module run test
pnpm --filter @gh-reusable/docker-facts-action run test

# Single Vitest file in dagger-pipelines
pnpm --filter @gh-reusable/dagger-pipelines run test -- src/workflows.test.ts

# Single Vitest file in dagger-module
pnpm --filter ./packages/dagger-module run test -- tests/new-functions.test.ts

# Single Vitest file in docker-facts action
pnpm --filter @gh-reusable/docker-facts-action run test -- src/index.test.ts

# Semver action uses Jest in its own folder
cd actions/semver && npm test -- tests/version.test.js
```

Rust checks used by the reusable Rust workflow:

```bash
cd tests/rust
cargo fmt -- --check
cargo clippy
cargo build --verbose
cargo test --verbose
```

## High-level architecture

- This repo ships **reusable workflows** (`.github/workflows/*`) and **reusable actions** (`actions/*`), but its primary goal is Dagger-first CI/CD logic: workflows should stay thin GitHub adapters while execution behavior lives in `packages/dagger-module/src/index.ts`.
- Treat Dagger module `@func()` entrypoints (`ci`, `dockerRelease`, `publish*`, `rustBuildAndTest`, etc.) as public contracts that reusable workflows and downstream repos depend on.
- Workflows invoke Dagger through the composite action `.github/actions/dagger-run/action.yml` (pre-warms engine `registry.dagger.io/engine:v0.20.8`, then calls `dagger/dagger-for-github@v8` with `module` + `call`).
- `packages/dagger-pipelines` contains shared workflow/pipeline primitives and governance tests. Its tests assert that workflow declarations, module function calls, and integration wiring stay consistent across `.github/workflows`.
- `packages/dagger-module/src/index.ts` also produces structured pipeline report output (JSON + markdown), and workflows like `publish.yaml` and `docker-release.yaml` turn that into GitHub summary/comments/artifacts.

## Key conventions in this codebase

- Workflows prefixed with `test-` are internal parity/regression workflows for this repo, not consumer-facing reusable workflows.
- For Dagger integration in workflows, pass explicit `with.call` (and usually `with.module`) via `dagger-run`; avoid legacy `verb/args` style.
- Keep Dagger call names aligned with kebab-case of module `@func()` names (validated by `packages/dagger-pipelines/src/dagger-module-integration.test.ts`).
- Prefer adding/changing behavior in Dagger functions first, then wiring workflows to those functions; avoid embedding core release/build logic directly in workflow shell steps.
- Preserve strong Dagger-side contracts: when changing `@func()` names, arguments, output shape, or semantics, update all workflow call sites and parity tests in the same change.
- Workflow input/secret declarations must be actually referenced in workflow body (validated by `packages/dagger-pipelines/src/workflow-governance.test.ts`).
- TypeScript-based actions (for example `actions/docker-facts`) use Vite build outputs and Node 24 action runtime; older actions (for example `actions/semver`) still use their original runtime/testing setup.

## MCP server guidance for this repo

- Prefer GitHub Actions MCP tools for CI debugging:
  - list workflow runs/jobs, then fetch failed job logs before editing workflow YAML.
  - Use run/job IDs from MCP responses instead of scraping logs manually.
- For reusable workflow/action changes, use GitHub PR/issue MCP tools to read discussion and check-run context before changing Dagger calls or workflow inputs.
