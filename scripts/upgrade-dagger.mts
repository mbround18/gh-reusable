#!/usr/bin/env node --type=module

// This script upgrades the default dagger version in the project.

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findActionYmlPaths(rootDir: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findActionYmlPaths(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name === "action.yml") {
      result.push(entryPath);
    }
  }

  return result;
}

// get the latest dagger version via catalog key in pnpm-workspace.yaml
const pnpmWorkspaceYamlPath = join(__dirname, "..", "pnpm-workspace.yaml");
const pnpmWorkspaceYaml = readFileSync(pnpmWorkspaceYamlPath, "utf-8");
const daggerVersionMatch = pnpmWorkspaceYaml.match(
  /"@dagger\.io\/dagger"\s*:\s*"([\d.]+)"/,
);
if (!daggerVersionMatch) {
  console.error(
    "Could not find @dagger.io/dagger version in pnpm-workspace.yaml",
  );
  process.exit(1);
}
const daggerVersion = daggerVersionMatch[1];

// find all action.yml
const repoRoot = join(__dirname, "..");
const actionYmlPaths = findActionYmlPaths(repoRoot);

// Update dagger engine image and dagger-for-github version input in action files.
for (const actionYmlPath of actionYmlPaths) {
  const actionYml = readFileSync(actionYmlPath, "utf-8");
  const updatedActionYml = actionYml
    .replace(
      /registry\.dagger\.io\/engine:v[\d.]+/g,
      `registry.dagger.io/engine:v${daggerVersion}`,
    )
    .replace(/(\bversion:\s*)v[\d.]+/g, `$1v${daggerVersion}`);

  if (updatedActionYml !== actionYml) {
    writeFileSync(actionYmlPath, updatedActionYml, "utf-8");
  }
}

console.log(
  `Updated dagger version to ${daggerVersion} in ${actionYmlPaths.length} action.yml files`,
);
