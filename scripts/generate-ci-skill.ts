#!/usr/bin/env npx tsx
/**
 * Generates skills/ci/SKILL.md and skills/ci/references/ci-manifest.json
 * from live repo state.
 *
 * Run: pnpm run generate:ci-skill
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const actionsDir = path.join(root, ".github", "actions");
const moduleSource = readFileSync(
  path.join(root, "packages", "dagger-module", "src", "index.ts"),
  "utf8",
);
const skillDir = path.join(root, "skills", "ci");
const refsDir = path.join(skillDir, "references");
const defaults = JSON.parse(
  readFileSync(path.join(root, "defaults.json"), "utf8"),
) as {
  rust: { toolchain: string };
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputDef {
  name: string;
  type: string;
  required: boolean;
  default: string | boolean | number | null;
  description: string;
}

interface SecretDef {
  name: string;
  required: boolean;
  description: string;
}

interface OutputDef {
  name: string;
  description: string;
}

interface WorkflowEntry {
  file: string;
  name: string;
  triggers: string[];
  isReusable: boolean;
  inputs: InputDef[];
  secrets: SecretDef[];
}

interface ActionEntry {
  dir: string;
  name: string;
  description: string;
  inputs: InputDef[];
  outputs: OutputDef[];
}

interface FuncParam {
  name: string;
  type: string;
  optional: boolean;
}

interface FunctionEntry {
  camel: string;
  kebab: string;
  params: FuncParam[];
}

interface Manifest {
  generatedAt: string;
  daggerVersion: string;
  moduleRef: string;
  reusableWorkflows: WorkflowEntry[];
  internalWorkflows: WorkflowEntry[];
  compositeActions: ActionEntry[];
  daggerFunctions: FunctionEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function parseInputs(rawInputs: Record<string, unknown>): InputDef[] {
  return Object.entries(rawInputs).map(([name, def]) => {
    const d = (def ?? {}) as Record<string, unknown>;
    return {
      name,
      type: typeof d.type === "string" ? d.type : "string",
      required: d.required === true,
      default:
        d.default !== undefined ? (d.default as InputDef["default"]) : null,
      description:
        typeof d.description === "string"
          ? d.description.replace(/\s+/g, " ").trim()
          : "",
    };
  });
}

function parseSecrets(rawSecrets: Record<string, unknown>): SecretDef[] {
  return Object.entries(rawSecrets).map(([name, def]) => {
    const d = (def ?? {}) as Record<string, unknown>;
    return {
      name,
      required: d.required === true,
      description:
        typeof d.description === "string" ? d.description.trim() : "",
    };
  });
}

// ─── Workflows ────────────────────────────────────────────────────────────────

function summarizeWorkflows(): WorkflowEntry[] {
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(workflowsDir, file), "utf8");
      const wf = parseYaml(raw) as Record<string, unknown>;
      const name = typeof wf.name === "string" ? wf.name : file;
      const on = (wf.on ?? {}) as Record<string, unknown>;
      const triggers: string[] = [];
      let isReusable = false;
      let inputs: InputDef[] = [];
      let secrets: SecretDef[] = [];

      for (const trigger of Object.keys(on)) {
        triggers.push(trigger);
        if (trigger === "workflow_call") {
          isReusable = true;
          const wc = (on.workflow_call ?? {}) as Record<string, unknown>;
          inputs = parseInputs((wc.inputs ?? {}) as Record<string, unknown>);
          secrets = parseSecrets((wc.secrets ?? {}) as Record<string, unknown>);
        }
      }

      return { file, name, triggers, isReusable, inputs, secrets };
    });
}

// ─── Composite actions ────────────────────────────────────────────────────────

function summarizeActions(): ActionEntry[] {
  return readdirSync(actionsDir)
    .flatMap((dir) => {
      const actionFile = ["action.yml", "action.yaml"].find((f) => {
        try {
          readFileSync(path.join(actionsDir, dir, f));
          return true;
        } catch {
          return false;
        }
      });
      if (!actionFile) return [];
      const raw = readFileSync(path.join(actionsDir, dir, actionFile), "utf8");
      const action = parseYaml(raw) as Record<string, unknown>;
      return [
        {
          dir,
          name: typeof action.name === "string" ? action.name : dir,
          description:
            typeof action.description === "string" ? action.description : "",
          inputs: parseInputs((action.inputs ?? {}) as Record<string, unknown>),
          outputs: Object.entries(
            (action.outputs ?? {}) as Record<string, unknown>,
          ).map(([name, def]) => ({
            name,
            description:
              typeof (def as Record<string, unknown>)?.description === "string"
                ? ((def as Record<string, unknown>).description as string)
                : "",
          })),
        },
      ];
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

// ─── Dagger functions ─────────────────────────────────────────────────────────

function extractFunctions(src: string): FunctionEntry[] {
  const funcRe = /@func\(\)\s+async\s+([A-Za-z0-9_]+)\s*\(/g;
  const entries: FunctionEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = funcRe.exec(src)) !== null) {
    const camel = m[1];
    const parenStart = m.index + m[0].length;
    // Walk to matching closing paren
    let depth = 1;
    let i = parenStart;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    const inner = src.slice(parenStart, i - 1).trim();

    const params: FuncParam[] = inner
      ? inner
          .split(",")
          .map((p) => {
            p = p.trim().replace(/\s+/g, " ");
            const colonIdx = p.indexOf(":");
            const name = (colonIdx > -1 ? p.slice(0, colonIdx) : p).trim();
            const rest = colonIdx > -1 ? p.slice(colonIdx + 1).trim() : "";
            const hasDefault = rest.includes("=");
            const rawType = hasDefault
              ? rest.slice(0, rest.indexOf("=")).trim()
              : rest.trim();
            return { name, type: rawType || "unknown", optional: hasDefault };
          })
          .filter((p) => p.name)
      : [];

    entries.push({ camel, kebab: toKebab(camel), params });
  }

  return entries;
}

// ─── Dagger version ───────────────────────────────────────────────────────────

function detectDaggerVersion(): string {
  const actionRaw = readFileSync(
    path.join(root, ".github", "actions", "dagger-run", "action.yml"),
    "utf8",
  );
  return actionRaw.match(/version:\s*(v\d+\.\d+\.\d+)/)?.[1] ?? "v0.x";
}

// ─── Build manifest ───────────────────────────────────────────────────────────

const workflows = summarizeWorkflows();
const manifest: Manifest = {
  generatedAt: new Date().toISOString().slice(0, 10),
  daggerVersion: detectDaggerVersion(),
  moduleRef: "github.com/mbround18/gh-reusable/packages/dagger-module@main",
  reusableWorkflows: workflows.filter(
    (w) => w.isReusable && !w.file.startsWith("test-"),
  ),
  internalWorkflows: workflows.filter((w) => !w.isReusable),
  compositeActions: summarizeActions(),
  daggerFunctions: extractFunctions(moduleSource),
};

// ─── Write manifest ───────────────────────────────────────────────────────────

mkdirSync(refsDir, { recursive: true });
writeFileSync(
  path.join(refsDir, "ci-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

// ─── Build SKILL.md ───────────────────────────────────────────────────────────

const reusableRows = manifest.reusableWorkflows.map((wf) => {
  const inputs = wf.inputs
    .map((i) => (i.required ? i.name : `${i.name}?`))
    .join(", ");
  const secrets = wf.secrets
    .map((s) => (s.required ? s.name : `${s.name}?`))
    .join(", ");
  return `| [\`${wf.file}\`](references/ci-manifest.json) | ${wf.name} | ${inputs || "—"} | ${secrets || "—"} |`;
});

const funcRows = manifest.daggerFunctions.map((fn) => {
  const params = fn.params
    .map((p) => (p.optional ? `${p.name}?` : p.name))
    .join(", ");
  return `| \`${fn.kebab}\` | ${params || "—"} |`;
});

const internalList = manifest.internalWorkflows
  .map((w) => `- \`${w.file}\` — ${w.name} *(${w.triggers.join(", ")})*`)
  .join("\n");

const actionList = manifest.compositeActions
  .map((a) => {
    const ins = a.inputs.map((i) => `\`${i.name}\``).join(", ");
    const outs = a.outputs.map((o) => `\`${o.name}\``).join(", ");
    return [
      `**\`.github/actions/${a.dir}\`** — ${a.description}`,
      ins ? `  Inputs: ${ins}` : "",
      outs ? `  Outputs: ${outs}` : "",
    ]
      .filter(Boolean)
      .join("  \n");
  })
  .join("\n\n");

const skill = `---
name: ci
description: >
  Knowledge of the gh-reusable CI system: reusable GitHub Actions workflows,
  composite actions, and the Dagger TypeScript module that backs them. Use when
  adding, modifying, or debugging CI in any repo that consumes gh-reusable,
  when wiring up a new workflow, or when working inside the gh-reusable repo itself.
compatibility: Designed for Claude Code. Requires access to the gh-reusable repository.
metadata:
  author: mbround18
  dagger-version: "${manifest.daggerVersion}"
  module: "${manifest.moduleRef}"
  generated: "${manifest.generatedAt}"
---

# gh-reusable CI skill

All CI logic runs through a [Dagger](https://dagger.io) TypeScript module at
\`packages/dagger-module/src/index.ts\`. Workflows are thin callers via the
\`dagger-run\` composite action. Full structured detail is in
[references/ci-manifest.json](references/ci-manifest.json).

**Dagger:** \`${manifest.daggerVersion}\` · **Module:** \`${manifest.moduleRef}\`

## Architecture

\`\`\`
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
\`\`\`

## Composite actions

${actionList}

## Reusable workflows

Full input/secret details in [references/ci-manifest.json](references/ci-manifest.json).

| File | Name | Inputs (? = optional) | Secrets (? = optional) |
| --- | --- | --- | --- |
${reusableRows.join("\n")}

## Internal CI workflows

${internalList}

## Dagger module functions

Full param types in [references/ci-manifest.json](references/ci-manifest.json).

| Function (kebab-case) | Params (? = optional) |
| --- | --- |
${funcRows.join("\n")}

## Common patterns

### Call a Dagger function from a workflow step

\`\`\`yaml
- uses: ./.github/actions/dagger-run
  with:
    call: >-
      rust-build-and-test
      --source=.
      --toolchain=${defaults.rust.toolchain}
      --components=clippy,rustfmt
    cloud-token: \${{ secrets.DAGGER_CLOUD_TOKEN }}
\`\`\`

Omit \`module:\` — the action defaults to the published remote ref.
Use \`module: ./packages/dagger-module\` only inside this repo (pre-merge CI).

### Call a reusable workflow from another repo

\`\`\`yaml
jobs:
  build:
    uses: mbround18/gh-reusable/.github/workflows/rust-build-n-test.yaml@main
    secrets:
      DAGGER_CLOUD_TOKEN: \${{ secrets.DAGGER_CLOUD_TOKEN }}
      DISCORD_WEBHOOK_URL: \${{ secrets.DISCORD_WEBHOOK_URL }}
\`\`\`

### Discord notifications

Publish/release Dagger functions accept \`--discord-webhook=\${{ secrets.DISCORD_WEBHOOK_URL }}\`.

For CI pass/fail embeds (no Dagger required):

\`\`\`yaml
- if: always()
  uses: ./.github/actions/discord-notify
  with:
    webhook-url: \${{ secrets.DISCORD_WEBHOOK_URL }}
    status: \${{ job.status }}
    workflow: \${{ github.workflow }}
    run-url: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}
    ref: \${{ github.ref_name }}
\`\`\`

### Release flow

\`\`\`
push to main
  → tagger.yaml          compute-semver → git tag → gh release create
  → docker-release.yaml  triggered by tag push   → images published to DockerHub/GHCR
  → binary-release.yaml  triggered by release    → binaries zipped + uploaded
\`\`\`

### Add a new Dagger function

1. Add \`@func()\` async method to \`GhReusablePipelines\` in \`packages/dagger-module/src/index.ts\`
2. Add any new interfaces to \`packages/dagger-module/src/types.ts\`
3. Wire into a reusable workflow if needed
4. Run \`pnpm run generate:ci-skill\` — regenerates this file and \`references/ci-manifest.json\`

### Secrets reference

| Secret | Scope |
| --- | --- |
| \`DAGGER_CLOUD_TOKEN\` | All Dagger workflows (optional — cloud cache) |
| \`DISCORD_WEBHOOK_URL\` | All publish/release/test workflows (optional) |
| \`DOCKER_TOKEN\` | \`docker-release.yaml\` |
| \`GHCR_TOKEN\` | \`docker-release.yaml\` when \`ghcr: true\` |
| \`NPM_TOKEN\` | \`publish.yaml\` node target |
| \`CARGO_REGISTRY_TOKEN\` | \`publish.yaml\` rust-crate target |
| \`GH_TOKEN\` | \`tagger.yaml\`, \`rust-binary-release.yaml\` |
`;

writeFileSync(path.join(skillDir, "SKILL.md"), skill, "utf8");
console.log(`Written: skills/ci/SKILL.md`);
console.log(`Written: skills/ci/references/ci-manifest.json`);
