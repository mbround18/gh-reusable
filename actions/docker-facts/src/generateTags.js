const core = require("@actions/core");
const semver = require("semver");

/**
 * Generate Docker image tags.
 *
 * @param {string} image - Base image name
 * @param {string} version - Semver version (e.g. "1.2.3" or "v1.2.3")
 * @param {string} branch - Branch name or PR number
 * @param {string|string[]} registries - Registry prefixes
 * @returns {string[]} List of generated tags.
 */
function generateTags(image, version, branch, registries = "docker.io") {
  const tags = [];

  // Validate and clean image name.
  let cleanImage = image;
  if (image.includes(":")) {
    core.warning(
      `Image already has a tag: ${image}, extracting base image name`,
    );
    cleanImage = image.split(":")[0];
  } else if (image.includes(",")) {
    core.warning(`Invalid image name format: ${image} contains commas`);
    cleanImage = image.split(",")[0];
  }

  // Default version to 'latest' if empty.
  if (!version) {
    version = "latest";
  }

  // Process registries input
  let registryList = [];
  if (Array.isArray(registries)) {
    registryList = registries.filter((r) => r && r !== "");
  } else if (typeof registries === "string") {
    registryList = registries
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r !== "");
  }

  // Helper: push a tag to the list, including registry variants
  function pushTag(tag) {
    // Add unqualified tag
    tags.push(`${cleanImage}:${tag}`);

    // Add registry-qualified tags
    for (const registry of registryList) {
      tags.push(`${registry}/${cleanImage}:${tag}`);
    }
  }

  // Always add the exact version
  pushTag(version);

  // Add branch-specific tag if provided
  if (branch) {
    // If branch consists only of digits, add "pr-" prefix
    if (/^\d+$/.test(branch)) {
      branch = `pr-${branch}`;
    }

    // Sanitize branch name for Docker tag (replace invalid characters with hyphens)
    const sanitizedBranch = branch.replace(/[^a-zA-Z0-9._-]/g, "-");

    // Only add branch tags if the sanitized branch isn't "main" or "master"
    if (sanitizedBranch !== "main" && sanitizedBranch !== "master") {
      pushTag(sanitizedBranch);
    }
  }

  // For 'latest' version, stop here.
  if (version === "latest") {
    return tags;
  }

  // Skip cascading versions for special tags
  if (
    version.startsWith("sha-") ||
    /^[0-9a-f]{20,40}$/.test(version) ||
    version === "main" ||
    version === "master" ||
    version === "release-candidate"
  ) {
    return tags;
  }

  // Check for pre-release versions (do not add latest tags)
  const lowerVersion = version.toLowerCase();
  if (
    lowerVersion.includes("alpha") ||
    lowerVersion.includes("beta") ||
    lowerVersion.includes("rc")
  ) {
    return tags;
  }

  // Check for production suffix (_prod, -prod) and feature tags
  if (
    version.endsWith("_prod") ||
    version.endsWith("-prod") ||
    version.includes("-feature-")
  ) {
    return tags;
  }

  // Handle app-name-version pattern (e.g., app-name-1.2.3)
  if (version.includes("-")) {
    // For app-name-version pattern, split on last hyphen
    const lastHyphen = version.lastIndexOf("-");
    const appNamePart = version.substring(0, lastHyphen);
    const versionPart = version.substring(lastHyphen + 1);

    // Add app-name-latest tag
    pushTag(`${appNamePart}-latest`);

    // Check if version part is a semver
    if (!/^v?\d+(\.\d+)*$/.test(versionPart)) {
      return tags;
    }

    // Skip cascading for 0.x.x versions
    if (versionPart.startsWith("0") || versionPart.startsWith("v0")) {
      return tags;
    }

    // Generate cascading versions for app-name pattern
    const isVPrefixed = versionPart.startsWith("v");
    const prefix = isVPrefixed ? "v" : "";
    const numericPart = isVPrefixed ? versionPart.substring(1) : versionPart;
    const parts = numericPart.split(".");

    // Add major.minor version
    if (parts.length > 2) {
      const majorMinor = `${appNamePart}-${prefix}${parts[0]}.${parts[1]}`;
      if (majorMinor !== version) {
        pushTag(majorMinor);
      }
    }

    // Add major version
    if (parts.length > 1) {
      const major = `${appNamePart}-${prefix}${parts[0]}`;
      if (major !== version) {
        pushTag(major);
      }
    }

    return tags;
  }

  // Skip cascading for date-based versions
  if (
    /^\d{8}$/.test(version) ||
    /^\d{4}\.\d{2}\.\d{2}$/.test(version) ||
    /^v\d{4}\.\d{2}\.\d{2}$/.test(version)
  ) {
    // Still add latest for date-based versions
    pushTag("latest");
    return tags;
  }

  // For standard semver versions, generate cascading tags
  const isVPrefixed = version.startsWith("v");
  const numericVersion = isVPrefixed ? version.substring(1) : version;
  const parts = numericVersion.split(".");

  // For standard versions, add 'latest' tag
  pushTag("latest");

  // For a one-part version, nothing more to cascade (e.g., "1")
  if (parts.length === 1) {
    return tags;
  }

  // For versions beginning with 0, do not cascade (e.g., 0.1.2)
  if (parts[0] === "0") {
    return tags;
  }

  // Add major.minor version (e.g., v1.2 or 1.2)
  if (parts.length > 2) {
    const majorMinor = `${isVPrefixed ? "v" : ""}${parts[0]}.${parts[1]}`;
    if (majorMinor !== version) {
      pushTag(majorMinor);
    }
  }

  // Add major version (e.g., v1 or 1)
  const major = `${isVPrefixed ? "v" : ""}${parts[0]}`;
  if (major !== version) {
    pushTag(major);
  }

  return tags;
}

module.exports = generateTags;
module.exports.__testables = { generateTags };
