"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const fs = require("node:fs");
const path = require("node:path");
const cache = require("@actions/cache");
const core = require("@actions/core");
const toolCache = require("@actions/tool-cache");
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
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const cache__namespace = /* @__PURE__ */ _interopNamespaceDefault(cache);
const core__namespace = /* @__PURE__ */ _interopNamespaceDefault(core);
const toolCache__namespace = /* @__PURE__ */ _interopNamespaceDefault(toolCache);
async function resolveVersion(owner, repo, version, token) {
  if (version !== "latest") {
    return version;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json"
    }
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release for ${owner}/${repo}: ${response.status} ${response.statusText}`
    );
  }
  const data = await response.json();
  if (!data.tag_name) {
    throw new Error(`No tag_name found in latest release response for ${owner}/${repo}`);
  }
  return data.tag_name;
}
function expandAssetName(pattern, version) {
  if (pattern.includes("%VERSION%")) {
    const expanded = pattern.replace(/%VERSION%/g, version);
    return expanded;
  }
  return pattern;
}
async function downloadAndExtract(url, assetName, token) {
  const downloadPath = await toolCache__namespace.downloadTool(url, void 0, `token ${token}`);
  if (assetName.endsWith(".tar.gz") || assetName.endsWith(".tgz")) {
    const extractedDir = await toolCache__namespace.extractTar(downloadPath);
    return extractedDir;
  }
  if (assetName.endsWith(".zip")) {
    const extractedDir = await toolCache__namespace.extractZip(downloadPath);
    return extractedDir;
  }
  const path2 = await import("node:path");
  const fs2 = await import("node:fs");
  const dir = path2.dirname(downloadPath);
  const destPath = path2.join(dir, assetName);
  fs2.renameSync(downloadPath, destPath);
  fs2.chmodSync(destPath, 493);
  return dir;
}
async function run() {
  try {
    const repository = core__namespace.getInput("repository", { required: true });
    const version = core__namespace.getInput("version") || "latest";
    const assetPattern = core__namespace.getInput("asset", { required: true });
    const overrideName = core__namespace.getInput("override-name");
    const githubToken = core__namespace.getInput("github-token") || process.env.GITHUB_TOKEN || "";
    const parts = repository.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repository format "${repository}". Expected "owner/repo".`);
    }
    const [owner, repo] = parts;
    core__namespace.info(`Resolving version "${version}" for ${repository}...`);
    const resolvedVersion = await resolveVersion(owner, repo, version, githubToken);
    core__namespace.info(`Resolved version: ${resolvedVersion}`);
    const cacheKey = `cli-${repository}-${resolvedVersion}`;
    const cachePaths = [path__namespace.join(process.env.RUNNER_TOOL_CACHE ?? "/tmp", cacheKey)];
    const cacheHitKey = await cache__namespace.restoreCache(cachePaths, cacheKey);
    if (cacheHitKey) {
      core__namespace.info(`Cache hit for key "${cacheKey}". Adding to PATH.`);
      core__namespace.addPath(cachePaths[0]);
    } else {
      core__namespace.info(`Cache miss for key "${cacheKey}". Downloading...`);
      const assetName = expandAssetName(assetPattern, resolvedVersion);
      const downloadUrl = `https://github.com/${repository}/releases/download/${resolvedVersion}/${assetName}`;
      core__namespace.info(`Downloading from: ${downloadUrl}`);
      const extractedDir = await downloadAndExtract(downloadUrl, assetName, githubToken);
      if (overrideName) {
        const dirEntries = fs__namespace.readdirSync(extractedDir);
        const binary = dirEntries.find((entry) => {
          const fullPath = path__namespace.join(extractedDir, entry);
          return fs__namespace.statSync(fullPath).isFile();
        });
        if (binary) {
          const oldPath = path__namespace.join(extractedDir, binary);
          const newPath = path__namespace.join(extractedDir, overrideName);
          if (oldPath !== newPath) {
            fs__namespace.renameSync(oldPath, newPath);
            core__namespace.info(`Renamed "${binary}" to "${overrideName}"`);
          }
        }
      }
      core__namespace.addPath(extractedDir);
      const cacheDir = cachePaths[0];
      if (extractedDir !== cacheDir) {
        fs__namespace.mkdirSync(cacheDir, { recursive: true });
        for (const entry of fs__namespace.readdirSync(extractedDir)) {
          fs__namespace.renameSync(path__namespace.join(extractedDir, entry), path__namespace.join(cacheDir, entry));
        }
        core__namespace.addPath(cacheDir);
      }
      await cache__namespace.saveCache(cachePaths, cacheKey);
      core__namespace.info(`Saved cache with key "${cacheKey}".`);
    }
    core__namespace.setOutput("version", resolvedVersion);
    core__namespace.info(`install-cli complete. Version: ${resolvedVersion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core__namespace.setFailed(message);
  }
}
void run();
//# sourceMappingURL=index.js.map
