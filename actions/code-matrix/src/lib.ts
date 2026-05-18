import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CodeMatrixResult {
  languages: string;
  packageManagers: string;
  nodePackageManager: string;
  hasDocker: boolean;
  hasHelm: boolean;
  hasCompose: boolean;
  isMonorepo: boolean;
  manifests: string;
  lockfiles: string;
  publishTargets: string;
}

const LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'Cargo.lock'
] as const;

const MANIFEST_FILENAMES = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Chart.yaml'
] as const;

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml'
] as const;

const MONOREPO_MARKERS = [
  'pnpm-workspace.yaml',
  'lerna.json',
  'nx.json'
] as const;

function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function findManifestsRecursive(dir: string, currentDepth: number, maxDepth: number): string[] {
  const found: string[] = [];

  if (currentDepth > maxDepth) {
    return found;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && (MANIFEST_FILENAMES as readonly string[]).includes(entry.name)) {
      found.push(fullPath);
    } else if (entry.isDirectory() && currentDepth < maxDepth) {
      found.push(...findManifestsRecursive(fullPath, currentDepth + 1, maxDepth));
    }
  }

  return found;
}

export function detectCodeMatrix(dir: string): CodeMatrixResult {
  // --- Lockfiles (root only) ---
  const foundLockfiles: string[] = [];
  for (const lockfile of LOCKFILES) {
    if (exists(path.join(dir, lockfile))) {
      foundLockfiles.push(lockfile);
    }
  }

  const hasPnpmLock = foundLockfiles.includes('pnpm-lock.yaml');
  const hasYarnLock = foundLockfiles.includes('yarn.lock');
  const hasNpmLock = foundLockfiles.includes('package-lock.json');
  const hasCargoLock = foundLockfiles.includes('Cargo.lock');

  // --- Manifests (recursive, max depth 3) ---
  const foundManifestPaths = findManifestsRecursive(dir, 0, 3);
  const foundManifestNames = foundManifestPaths.map((p) => path.basename(p));

  const hasPackageJson = foundManifestNames.includes('package.json');
  const hasCargoToml = foundManifestNames.includes('Cargo.toml');
  const hasPyproject = foundManifestNames.includes('pyproject.toml');
  const hasRequirements = foundManifestNames.includes('requirements.txt');
  const hasGoMod = foundManifestNames.includes('go.mod');
  const hasChartYaml = foundManifestNames.includes('Chart.yaml');

  // --- Tooling (depth 1 for tsconfig + Dockerfile) ---
  const hasTsconfig = exists(path.join(dir, 'tsconfig.json'));

  let hasDockerfile = false;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // ignore
  }
  for (const entry of entries) {
    if (entry.isFile() && (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
      hasDockerfile = true;
      break;
    }
  }

  let hasCompose = false;
  for (const composeFile of COMPOSE_FILES) {
    if (exists(path.join(dir, composeFile))) {
      hasCompose = true;
      break;
    }
  }

  let isMonorepo = false;
  for (const marker of MONOREPO_MARKERS) {
    if (exists(path.join(dir, marker))) {
      isMonorepo = true;
      break;
    }
  }

  // --- Languages ---
  const languages: string[] = [];
  const hasNode = hasPackageJson || hasPnpmLock || hasYarnLock || hasNpmLock;
  if (hasNode) {
    if (hasTsconfig) {
      languages.push('typescript');
    } else {
      languages.push('javascript');
    }
  }
  if (hasCargoToml || hasCargoLock) {
    languages.push('rust');
  }
  if (hasPyproject || hasRequirements) {
    languages.push('python');
  }
  if (hasGoMod) {
    languages.push('go');
  }

  // --- Package Managers ---
  const packageManagers: string[] = [];
  let nodePackageManager = '';

  if (hasPnpmLock) {
    packageManagers.push('pnpm');
    nodePackageManager = 'pnpm';
  } else if (hasYarnLock) {
    packageManagers.push('yarn');
    nodePackageManager = 'yarn';
  } else if (hasNpmLock || hasPackageJson) {
    packageManagers.push('npm');
    nodePackageManager = 'npm';
  }

  if (hasCargoToml || hasCargoLock) {
    packageManagers.push('cargo');
  }
  if (hasPyproject || hasRequirements) {
    packageManagers.push('pip');
  }
  if (hasGoMod) {
    packageManagers.push('go');
  }

  // --- Publish Targets ---
  const publishTargets: string[] = [];
  if (nodePackageManager) {
    publishTargets.push(nodePackageManager);
  }
  if (hasCargoToml || hasCargoLock) {
    publishTargets.push('rust-crate');
  }
  if (hasChartYaml) {
    publishTargets.push('helm-chart');
  }

  // --- Manifest list (relative paths, comma-separated) ---
  const manifestList = foundManifestPaths
    .map((p) => path.relative(dir, p))
    .join(',');

  return {
    languages: languages.join(','),
    packageManagers: packageManagers.join(','),
    nodePackageManager,
    hasDocker: hasDockerfile,
    hasHelm: hasChartYaml,
    hasCompose,
    isMonorepo,
    manifests: manifestList,
    lockfiles: foundLockfiles.join(','),
    publishTargets: publishTargets.join(',')
  };
}
