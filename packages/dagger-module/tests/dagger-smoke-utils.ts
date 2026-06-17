import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
export const repositoryRoot = path.resolve(dirname, "../../../");
const daggerBinDir = path.join(repositoryRoot, "bin");

export function shouldSkipDaggerSmokeTests(): boolean {
  if (process.env.DAGGER_PNPM_PIPELINE === "1") {
    return true;
  }
  // Nested Dagger sessions in CI commonly lack an image driver for child sessions.
  if (process.env.DAGGER_SESSION_PORT || process.env.DAGGER_SESSION_TOKEN) {
    return true;
  }
  return false;
}

function isExecutableBinary(candidate: string): boolean {
  if (!existsSync(candidate)) {
    return false;
  }
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    try {
      chmodSync(candidate, 0o755);
      accessSync(candidate, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}

function findDaggerBinaries(dir: string, depth: number): string[] {
  if (depth < 0 || !existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const binaries: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "dagger" && isExecutableBinary(entryPath)) {
      binaries.push(entryPath);
      continue;
    }
    if (entry.isDirectory()) {
      binaries.push(...findDaggerBinaries(entryPath, depth - 1));
    }
  }

  return binaries;
}

function resolveDaggerBinaryPath(): string | undefined {
  const preferred = [
    path.join(daggerBinDir, "dagger"),
    path.join(daggerBinDir, "bin", "dagger"),
  ];
  for (const candidate of preferred) {
    if (isExecutableBinary(candidate)) {
      return candidate;
    }
  }

  const discovered = findDaggerBinaries(daggerBinDir, 4);
  return discovered[0];
}

export function ensureDaggerBinary(): string {
  const existingBinary = resolveDaggerBinaryPath();
  if (existingBinary) {
    return existingBinary;
  }

  const result = spawnSync(
    "sh",
    [
      "-lc",
      [
        "set -eu",
        "mkdir -p bin",
        "cd bin",
        "curl -fsSL https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=v0.20.8 sh",
        "find . -maxdepth 4 -type f -name dagger -exec chmod +x {} + || true",
      ].join("\n"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Failed to install matching Dagger CLI:\n${result.stdout}\n${result.stderr}`,
    );
  }

  const installedBinary = resolveDaggerBinaryPath();
  if (!installedBinary) {
    throw new Error(
      `Dagger CLI install finished but no executable binary found under ${daggerBinDir}`,
    );
  }
  return installedBinary;
}

export function parsePipelineOutput(
  stdout: string,
  stderr: string,
): Record<string, unknown> {
  const output = `${stdout}\n${stderr}`.trim();
  const jsonLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error(`Did not find JSON output in Dagger response:\n${output}`);
  }
  return JSON.parse(jsonLine) as Record<string, unknown>;
}

export function isDaggerRuntimeUnavailable(stdout: string, stderr: string): boolean {
  const output = `${stdout}\n${stderr}`;
  return (
    output.includes('driver for scheme "image" was not available') ||
    output.includes("Cannot connect to the Docker daemon") ||
    output.includes("start engine:")
  );
}
