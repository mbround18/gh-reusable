"use strict";
const path = require("node:path");
const core = require("@actions/core");
const fs = require("node:fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const core__namespace = /* @__PURE__ */ _interopNamespaceDefault(core);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "Cargo.lock"
];
const MANIFEST_FILENAMES = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Chart.yaml"
];
const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml"
];
const MONOREPO_MARKERS = [
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json"
];
function exists(filePath) {
  return fs__namespace.existsSync(filePath);
}
function findManifestsRecursive(dir, currentDepth, maxDepth) {
  const found = [];
  if (currentDepth > maxDepth) {
    return found;
  }
  let entries;
  try {
    entries = fs__namespace.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "target" || entry.name === "dist") {
      continue;
    }
    const fullPath = path__namespace.join(dir, entry.name);
    if (entry.isFile() && MANIFEST_FILENAMES.includes(entry.name)) {
      found.push(fullPath);
    } else if (entry.isDirectory() && currentDepth < maxDepth) {
      found.push(...findManifestsRecursive(fullPath, currentDepth + 1, maxDepth));
    }
  }
  return found;
}
function detectCodeMatrix(dir) {
  const foundLockfiles = [];
  for (const lockfile of LOCKFILES) {
    if (exists(path__namespace.join(dir, lockfile))) {
      foundLockfiles.push(lockfile);
    }
  }
  const hasPnpmLock = foundLockfiles.includes("pnpm-lock.yaml");
  const hasYarnLock = foundLockfiles.includes("yarn.lock");
  const hasNpmLock = foundLockfiles.includes("package-lock.json");
  const hasCargoLock = foundLockfiles.includes("Cargo.lock");
  const foundManifestPaths = findManifestsRecursive(dir, 0, 3);
  const foundManifestNames = foundManifestPaths.map((p) => path__namespace.basename(p));
  const hasPackageJson = foundManifestNames.includes("package.json");
  const hasCargoToml = foundManifestNames.includes("Cargo.toml");
  const hasPyproject = foundManifestNames.includes("pyproject.toml");
  const hasRequirements = foundManifestNames.includes("requirements.txt");
  const hasGoMod = foundManifestNames.includes("go.mod");
  const hasChartYaml = foundManifestNames.includes("Chart.yaml");
  const hasTsconfig = exists(path__namespace.join(dir, "tsconfig.json"));
  let hasDockerfile = false;
  let entries = [];
  try {
    entries = fs__namespace.readdirSync(dir, { withFileTypes: true });
  } catch {
  }
  for (const entry of entries) {
    if (entry.isFile() && (entry.name === "Dockerfile" || entry.name.startsWith("Dockerfile."))) {
      hasDockerfile = true;
      break;
    }
  }
  let hasCompose = false;
  for (const composeFile of COMPOSE_FILES) {
    if (exists(path__namespace.join(dir, composeFile))) {
      hasCompose = true;
      break;
    }
  }
  let isMonorepo = false;
  for (const marker of MONOREPO_MARKERS) {
    if (exists(path__namespace.join(dir, marker))) {
      isMonorepo = true;
      break;
    }
  }
  const languages = [];
  const hasNode = hasPackageJson || hasPnpmLock || hasYarnLock || hasNpmLock;
  if (hasNode) {
    if (hasTsconfig) {
      languages.push("typescript");
    } else {
      languages.push("javascript");
    }
  }
  if (hasCargoToml || hasCargoLock) {
    languages.push("rust");
  }
  if (hasPyproject || hasRequirements) {
    languages.push("python");
  }
  if (hasGoMod) {
    languages.push("go");
  }
  const packageManagers = [];
  let nodePackageManager = "";
  if (hasPnpmLock) {
    packageManagers.push("pnpm");
    nodePackageManager = "pnpm";
  } else if (hasYarnLock) {
    packageManagers.push("yarn");
    nodePackageManager = "yarn";
  } else if (hasNpmLock || hasPackageJson) {
    packageManagers.push("npm");
    nodePackageManager = "npm";
  }
  if (hasCargoToml || hasCargoLock) {
    packageManagers.push("cargo");
  }
  if (hasPyproject || hasRequirements) {
    packageManagers.push("pip");
  }
  if (hasGoMod) {
    packageManagers.push("go");
  }
  const publishTargets = [];
  if (nodePackageManager) {
    publishTargets.push(nodePackageManager);
  }
  if (hasCargoToml || hasCargoLock) {
    publishTargets.push("rust-crate");
  }
  if (hasChartYaml) {
    publishTargets.push("helm-chart");
  }
  const manifestList = foundManifestPaths.map((p) => path__namespace.relative(dir, p)).join(",");
  return {
    languages: languages.join(","),
    packageManagers: packageManagers.join(","),
    nodePackageManager,
    hasDocker: hasDockerfile,
    hasHelm: hasChartYaml,
    hasCompose,
    isMonorepo,
    manifests: manifestList,
    lockfiles: foundLockfiles.join(","),
    publishTargets: publishTargets.join(",")
  };
}
async function run() {
  try {
    const inputPath = core__namespace.getInput("path") || ".";
    const resolvedPath = path__namespace.resolve(inputPath);
    core__namespace.info(`Detecting code matrix for: ${resolvedPath}`);
    const result = detectCodeMatrix(resolvedPath);
    core__namespace.setOutput("json", JSON.stringify(result));
    core__namespace.setOutput("languages", result.languages);
    core__namespace.setOutput("package-managers", result.packageManagers);
    core__namespace.setOutput("node-package-manager", result.nodePackageManager);
    core__namespace.setOutput("has-docker", String(result.hasDocker));
    core__namespace.setOutput("has-helm", String(result.hasHelm));
    core__namespace.setOutput("has-compose", String(result.hasCompose));
    core__namespace.setOutput("is-monorepo", String(result.isMonorepo));
    core__namespace.setOutput("publish-targets", result.publishTargets);
    await core__namespace.summary.addHeading("Code Matrix Detection Results").addTable([
      [
        { data: "Property", header: true },
        { data: "Value", header: true }
      ],
      ["Languages", result.languages || "(none)"],
      ["Package Managers", result.packageManagers || "(none)"],
      ["Node Package Manager", result.nodePackageManager || "(none)"],
      ["Has Docker", String(result.hasDocker)],
      ["Has Helm", String(result.hasHelm)],
      ["Has Compose", String(result.hasCompose)],
      ["Is Monorepo", String(result.isMonorepo)],
      ["Publish Targets", result.publishTargets || "(none)"],
      ["Manifests", result.manifests || "(none)"],
      ["Lockfiles", result.lockfiles || "(none)"]
    ]).write();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core__namespace.setFailed(message);
  }
}
void run();
//# sourceMappingURL=index.js.map
