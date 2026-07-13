#!/usr/bin/env node --import tsx

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const githubRoot = join(repoRoot, ".github");
const cooldownDays = 14;
const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
const cutoffMs = Date.now() - cooldownMs;
const cutoffIso = new Date(cutoffMs).toISOString();

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
};

type Semver = {
  major: number;
  minor: number;
  patch: number;
};

type ParsedReference = {
  indent: string;
  key: "uses" | "module";
  source: string;
  ref: string;
  comment: string;
};

function walkFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(entryPath));
      continue;
    }
    if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
      result.push(entryPath);
    }
  }
  return result;
}

function getOriginSlug(): string {
  const origin = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const match = origin.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Unable to parse git origin URL: ${origin}`);
  }

  return `${match[1]}/${match[2]}`;
}

function parseSemver(tag: string): Semver | null {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function parseReferenceLine(line: string): ParsedReference | null {
  const match = line.match(/^(\s*)(uses|module):\s+([^\s#]+)(\s*(#.*)?)$/);
  if (!match) return null;

  const [, indent, key, spec, , comment = ""] = match;
  const at = spec.lastIndexOf("@");
  if (at < 0) return null;

  return {
    indent: `${indent}${key}: `,
    key: key as "uses" | "module",
    source: spec.slice(0, at),
    ref: spec.slice(at + 1),
    comment,
  };
}

function isLocalSpec(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function isSha(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref);
}

function buildReleaseUrl(owner: string, repo: string, tag: string): string {
  return `https://github.com/${owner}/${repo}/releases/tag/${tag}`;
}

async function getGitHubToken(): Promise<string> {
  const envToken =
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GITHUB_API_TOKEN ||
    "";
  if (envToken) return envToken.trim();

  try {
    return execFileSync("gh", ["auth", "token"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

async function githubApi<T>(path: string): Promise<T> {
  const token = await getGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gh-reusable-pin-github-actions",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed for ${path}: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

async function listReleases(owner: string, repo: string): Promise<Release[]> {
  return githubApi<Release[]>(
    `/repos/${owner}/${repo}/releases?per_page=100&page=1`,
  );
}

async function resolveTagSha(owner: string, repo: string, tag: string) {
  const ref = await githubApi<{
    object: { type: string; sha: string; url: string };
  }>(`/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`);

  if (ref.object.type === "tag") {
    const tagObject = await githubApi<{ object: { sha: string } }>(
      new URL(ref.object.url).pathname,
    );
    return tagObject.object.sha;
  }

  return ref.object.sha;
}

async function resolveLatestEligibleRelease(
  owner: string,
  repo: string,
  majorConstraint: number | null,
): Promise<{ release: Release; semver: Semver } | null> {
  const releases = await listReleases(owner, repo);
  const eligible = releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.published_at !== null)
    .filter(
      (release) => new Date(release.published_at as string).getTime() <= cutoffMs,
    )
    .map((release) => ({
      release,
      semver: parseSemver(release.tag_name),
    }))
    .filter(
      (entry): entry is { release: Release; semver: Semver } =>
        entry.semver !== null,
    )
    .filter(
      (entry) =>
        majorConstraint === null || entry.semver.major === majorConstraint,
    )
    .sort((a, b) => compareSemver(a.semver, b.semver));

  return eligible.at(-1) ?? null;
}

function deriveMajorConstraint(ref: string): number | null {
  const semver = parseSemver(ref);
  return semver?.major ?? null;
}

function normalizeSource(source: string): string {
  return source.replace(/^github\.com\//, "");
}

async function resolvePinnedSpec(
  reference: ParsedReference,
  originSlug: string,
): Promise<{ spec: string; comment: string } | null> {
  if (isLocalSpec(reference.source) || reference.source.startsWith("docker://")) {
    return null;
  }

  const normalizedSource = normalizeSource(reference.source);
  if (
    normalizedSource === originSlug ||
    normalizedSource.startsWith(`${originSlug}/`)
  ) {
    return null;
  }

  if (isSha(reference.ref)) {
    return null;
  }

  const [owner, repo] = reference.source.split("/", 2);
  if (!owner || !repo) return null;

  const latest = await resolveLatestEligibleRelease(
    owner,
    repo,
    deriveMajorConstraint(reference.ref),
  );
  if (!latest) return null;

  const sha = await resolveTagSha(owner, repo, latest.release.tag_name);
  return {
    spec: `${reference.source}@${sha}`,
    comment: `${latest.release.tag_name}, ${buildReleaseUrl(
      owner,
      repo,
      latest.release.tag_name,
    )}`,
  };
}

async function main() {
  const originSlug = getOriginSlug();
  const files = walkFiles(githubRoot);
  const updates: string[] = [];

  for (const filePath of files) {
    const original = readFileSync(filePath, "utf8");
    const lines = original.split("\n");
    let changed = false;

    for (let index = 0; index < lines.length; index += 1) {
      const reference = parseReferenceLine(lines[index]);
      if (!reference) continue;

      const resolved = await resolvePinnedSpec(reference, originSlug);
      if (!resolved) continue;

      const nextLine = `${reference.indent}${resolved.spec} # ${resolved.comment}`;
      if (nextLine !== lines[index]) {
        lines[index] = nextLine;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(filePath, lines.join("\n"), "utf8");
      updates.push(relative(repoRoot, filePath));
    }
  }

  console.log(
    `Updated ${updates.length} file(s) with SHA-pinned GitHub Actions refs older than ${cooldownDays} days (cutoff ${cutoffIso}).`,
  );
  for (const file of updates) {
    console.log(`- ${file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
