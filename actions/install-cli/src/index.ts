import * as fs from 'node:fs';
import * as path from 'node:path';

import * as cache from '@actions/cache';
import * as core from '@actions/core';

import { downloadAndExtract, expandAssetName, resolveVersion } from './lib';

async function run(): Promise<void> {
  try {
    // --- Parse inputs ---
    const repository = core.getInput('repository', { required: true });
    const version = core.getInput('version') || 'latest';
    const assetPattern = core.getInput('asset', { required: true });
    const overrideName = core.getInput('override-name');
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';

    // --- Split repository into owner/repo ---
    const parts = repository.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repository format "${repository}". Expected "owner/repo".`);
    }
    const [owner, repo] = parts as [string, string];

    // --- Resolve version ---
    core.info(`Resolving version "${version}" for ${repository}...`);
    const resolvedVersion = await resolveVersion(owner, repo, version, githubToken);
    core.info(`Resolved version: ${resolvedVersion}`);

    // --- Compute cache key ---
    const cacheKey = `cli-${repository}-${resolvedVersion}`;
    const cachePaths = [path.join(process.env.RUNNER_TOOL_CACHE ?? '/tmp', cacheKey)];

    // --- Check cache ---
    const cacheHitKey = await cache.restoreCache(cachePaths, cacheKey);

    if (cacheHitKey) {
      core.info(`Cache hit for key "${cacheKey}". Adding to PATH.`);
      core.addPath(cachePaths[0]);
    } else {
      core.info(`Cache miss for key "${cacheKey}". Downloading...`);

      // --- Expand asset name ---
      const assetName = expandAssetName(assetPattern, resolvedVersion);
      const downloadUrl = `https://github.com/${repository}/releases/download/${resolvedVersion}/${assetName}`;

      core.info(`Downloading from: ${downloadUrl}`);
      const extractedDir = await downloadAndExtract(downloadUrl, assetName, githubToken);

      // --- Optionally rename binary ---
      if (overrideName) {
        const dirEntries = fs.readdirSync(extractedDir);
        // Find the first executable-looking file (not a directory)
        const binary = dirEntries.find((entry) => {
          const fullPath = path.join(extractedDir, entry);
          return fs.statSync(fullPath).isFile();
        });

        if (binary) {
          const oldPath = path.join(extractedDir, binary);
          const newPath = path.join(extractedDir, overrideName);
          if (oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
            core.info(`Renamed "${binary}" to "${overrideName}"`);
          }
        }
      }

      // --- Add to PATH ---
      core.addPath(extractedDir);

      // --- Ensure the cache directory exists and save cache ---
      const cacheDir = cachePaths[0];
      if (extractedDir !== cacheDir) {
        fs.mkdirSync(cacheDir, { recursive: true });
        for (const entry of fs.readdirSync(extractedDir)) {
          fs.renameSync(path.join(extractedDir, entry), path.join(cacheDir, entry));
        }
        core.addPath(cacheDir);
      }

      await cache.saveCache(cachePaths, cacheKey);
      core.info(`Saved cache with key "${cacheKey}".`);
    }

    core.setOutput('version', resolvedVersion);
    core.info(`install-cli complete. Version: ${resolvedVersion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();
