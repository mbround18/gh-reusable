import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, relative, basename } from "node:path";

const getInput = (n) =>
  (process.env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
const setOutput = (n, v) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${n}=${v}\n`);
const setFailed = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const info = (msg) => console.log(msg);

const LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "Cargo.lock",
];
const MANIFEST_FILENAMES = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Chart.yaml",
];
const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];
const MONOREPO_MARKERS = ["pnpm-workspace.yaml", "lerna.json", "nx.json"];
const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist"]);

function findManifests(dir, depth, maxDepth) {
  if (depth > maxDepth) return [];
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && MANIFEST_FILENAMES.includes(entry.name)) {
      found.push(fullPath);
    } else if (entry.isDirectory() && depth < maxDepth) {
      found.push(...findManifests(fullPath, depth + 1, maxDepth));
    }
  }
  return found;
}

try {
  const dir = getInput("path") || ".";

  const foundLockfiles = LOCKFILES.filter((f) => existsSync(join(dir, f)));
  const hasPnpm = foundLockfiles.includes("pnpm-lock.yaml");
  const hasYarn = foundLockfiles.includes("yarn.lock");
  const hasNpm = foundLockfiles.includes("package-lock.json");
  const hasCargo = foundLockfiles.includes("Cargo.lock");

  const manifestPaths = findManifests(dir, 0, 3);
  const manifestNames = manifestPaths.map((p) => basename(p));

  const hasPackageJson = manifestNames.includes("package.json");
  const hasCargoToml = manifestNames.includes("Cargo.toml");
  const hasPyproject = manifestNames.includes("pyproject.toml");
  const hasRequirements = manifestNames.includes("requirements.txt");
  const hasGoMod = manifestNames.includes("go.mod");
  const hasChartYaml = manifestNames.includes("Chart.yaml");
  const hasTsconfig = existsSync(join(dir, "tsconfig.json"));

  let hasDockerfile = false;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (
        e.isFile() &&
        (e.name === "Dockerfile" || e.name.startsWith("Dockerfile."))
      ) {
        hasDockerfile = true;
        break;
      }
    }
  } catch {
    /* ignore */
  }

  const hasCompose = COMPOSE_FILES.some((f) => existsSync(join(dir, f)));
  const isMonorepo = MONOREPO_MARKERS.some((f) => existsSync(join(dir, f)));
  const hasNode = hasPackageJson || hasPnpm || hasYarn || hasNpm;

  const languages = [];
  if (hasNode) languages.push(hasTsconfig ? "typescript" : "javascript");
  if (hasCargoToml || hasCargo) languages.push("rust");
  if (hasPyproject || hasRequirements) languages.push("python");
  if (hasGoMod) languages.push("go");

  const packageManagers = [];
  let nodePackageManager = "";
  if (hasPnpm) {
    packageManagers.push("pnpm");
    nodePackageManager = "pnpm";
  } else if (hasYarn) {
    packageManagers.push("yarn");
    nodePackageManager = "yarn";
  } else if (hasNpm || hasPackageJson) {
    packageManagers.push("npm");
    nodePackageManager = "npm";
  }
  if (hasCargoToml || hasCargo) packageManagers.push("cargo");
  if (hasPyproject || hasRequirements) packageManagers.push("pip");
  if (hasGoMod) packageManagers.push("go");

  const publishTargets = [];
  if (nodePackageManager) publishTargets.push(nodePackageManager);
  if (hasCargoToml || hasCargo) publishTargets.push("rust-crate");
  if (hasChartYaml) publishTargets.push("helm-chart");

  const result = {
    languages: languages.join(","),
    packageManagers: packageManagers.join(","),
    nodePackageManager,
    hasDocker: hasDockerfile,
    hasHelm: hasChartYaml,
    hasCompose,
    isMonorepo,
    manifests: manifestPaths.map((p) => relative(dir, p)).join(","),
    lockfiles: foundLockfiles.join(","),
    publishTargets: publishTargets.join(","),
  };

  info(`Detected: ${JSON.stringify(result, null, 2)}`);

  const jsonStr = JSON.stringify(result);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `json<<MATRIX\n${jsonStr}\nMATRIX\n`,
  );
  setOutput("languages", result.languages);
  setOutput("package-managers", result.packageManagers);
  setOutput("node-package-manager", result.nodePackageManager);
  setOutput("has-docker", String(result.hasDocker));
  setOutput("has-helm", String(result.hasHelm));
  setOutput("has-compose", String(result.hasCompose));
  setOutput("is-monorepo", String(result.isMonorepo));
  setOutput("publish-targets", result.publishTargets);
} catch (err) {
  setFailed(err instanceof Error ? err.message : String(err));
}
