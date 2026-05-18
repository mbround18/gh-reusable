import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  chmodSync,
  appendFileSync,
  createWriteStream,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const getInput = (n) =>
  (process.env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
const setOutput = (n, v) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${n}=${v}\n`);
const setFailed = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const addPath = (p) => appendFileSync(process.env.GITHUB_PATH, `${p}\n`);
const info = (msg) => console.log(msg);

async function resolveVersion(owner, repo, version, token) {
  if (version && version !== "latest") return version;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  if (!res.ok)
    throw new Error(
      `Failed to fetch latest release for ${owner}/${repo}: ${res.status} ${res.statusText}`,
    );
  const data = await res.json();
  if (!data.tag_name)
    throw new Error(`No tag_name found in latest release for ${owner}/${repo}`);
  return data.tag_name;
}

async function downloadFile(url, dest, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/octet-stream",
    },
  });
  if (!res.ok)
    throw new Error(
      `Download failed: ${res.status} ${res.statusText} — ${url}`,
    );
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
}

async function run() {
  try {
    const repository = getInput("repository");
    if (!repository) throw new Error('Input "repository" is required.');
    const version = getInput("version") || "latest";
    const assetPattern = getInput("asset");
    if (!assetPattern) throw new Error('Input "asset" is required.');
    const overrideName = getInput("override-name");
    const token = getInput("github-token") || process.env.GITHUB_TOKEN || "";

    const [owner, repo] = repository.split("/");
    if (!owner || !repo)
      throw new Error(
        `Invalid repository format "${repository}". Expected "owner/repo".`,
      );

    info(`Resolving version "${version}" for ${repository}...`);
    const resolvedVersion = await resolveVersion(owner, repo, version, token);
    info(`Resolved version: ${resolvedVersion}`);

    const cacheRoot = join(
      process.env.RUNNER_TOOL_CACHE ?? "/tmp/tool-cache",
      `${owner}-${repo}-${resolvedVersion}`,
    );

    if (existsSync(cacheRoot) && readdirSync(cacheRoot).length > 0) {
      info(`Cache hit at ${cacheRoot}. Adding to PATH.`);
      addPath(cacheRoot);
    } else {
      const assetName = assetPattern.replace(/%VERSION%/g, resolvedVersion);
      const downloadUrl = `https://github.com/${repository}/releases/download/${resolvedVersion}/${assetName}`;
      const tmpFile = join("/tmp", assetName);

      info(`Downloading from: ${downloadUrl}`);
      await downloadFile(downloadUrl, tmpFile, token);

      mkdirSync(cacheRoot, { recursive: true });

      if (assetName.endsWith(".tar.gz") || assetName.endsWith(".tgz")) {
        execSync(`tar -xzf "${tmpFile}" -C "${cacheRoot}"`);
      } else if (assetName.endsWith(".zip")) {
        execSync(`unzip -o "${tmpFile}" -d "${cacheRoot}"`);
      } else {
        const destBin = join(cacheRoot, assetName);
        renameSync(tmpFile, destBin);
        chmodSync(destBin, 0o755);
      }

      if (overrideName) {
        const entries = readdirSync(cacheRoot);
        const binary = entries.find((e) => {
          try {
            return !existsSync(join(cacheRoot, e, "."));
          } catch {
            return true;
          }
        });
        if (binary && binary !== overrideName) {
          renameSync(join(cacheRoot, binary), join(cacheRoot, overrideName));
          info(`Renamed "${binary}" to "${overrideName}"`);
        }
      }

      addPath(cacheRoot);
      info(`Installed to ${cacheRoot}`);
    }

    setOutput("version", resolvedVersion);
    info(`install-cli complete. Version: ${resolvedVersion}`);
  } catch (err) {
    setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
