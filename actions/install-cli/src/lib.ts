import * as toolCache from '@actions/tool-cache';

interface GitHubRelease {
  tag_name: string;
}

export async function resolveVersion(
  owner: string,
  repo: string,
  version: string,
  token: string
): Promise<string> {
  if (version && version !== 'latest') {
    return version;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release for ${owner}/${repo}: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as GitHubRelease;
  if (!data.tag_name) {
    throw new Error(`No tag_name found in latest release response for ${owner}/${repo}`);
  }

  return data.tag_name;
}

export function expandAssetName(pattern: string, version: string): string {
  if (pattern.includes('%VERSION%')) {
    const expanded = pattern.replace(/%VERSION%/g, version);
    // If the version has a leading 'v' and the expanded name still doesn't match expectations,
    // also try without the leading 'v'
    return expanded;
  }
  return pattern;
}

export async function downloadAndExtract(
  url: string,
  assetName: string,
  token: string
): Promise<string> {
  const downloadPath = await toolCache.downloadTool(url, undefined, `token ${token}`);

  if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tgz')) {
    const extractedDir = await toolCache.extractTar(downloadPath);
    return extractedDir;
  }

  if (assetName.endsWith('.zip')) {
    const extractedDir = await toolCache.extractZip(downloadPath);
    return extractedDir;
  }

  // Raw binary — return the directory containing the downloaded file
  const path = await import('node:path');
  const fs = await import('node:fs');

  const dir = path.dirname(downloadPath);
  const destPath = path.join(dir, assetName);

  fs.renameSync(downloadPath, destPath);
  fs.chmodSync(destPath, 0o755);

  return dir;
}
