const core = require("@actions/core");
const semver = require("semver");

/**
 * Generate Docker image tags.
 *
 * @param {string} image - Base image name
 * @param {string} version - Semver version (e.g. "1.2.3" or "v1.2.3")
 * @param {string} branch - Branch name or PR number
 * @param {string|string[]} registries - Registry prefixes
 * @param {boolean} withLatest - Whether to include the "latest" tag
 * @param {string} target - Target name to prepend to tags
 * @param {boolean} prepend_target - Whether to prepend target to version tags
 * @returns {string[]} List of generated tags.
 */
function generateTags(
  image,
  version,
  branch,
  registries = "docker.io",
  withLatest = false,
  target = "",
  prepend_target = false,
) {
  const tags = [];

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

  if (!version) {
    version = "latest";
  }

  // Handle target prefix if prepend_target is enabled and target is provided
  let tagPrefix = "";
  if (prepend_target && target) {
    tagPrefix = `${target}-`;
  }

  let registryList = [];
  if (Array.isArray(registries)) {
    registryList = registries.filter((r) => r && r !== "");
  } else if (typeof registries === "string") {
    registryList = registries
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r !== "");
  }

  function pushTag(tag) {
    tags.push(`${cleanImage}:${tagPrefix}${tag}`);

    for (const registry of registryList) {
      tags.push(`${registry}/${cleanImage}:${tagPrefix}${tag}`);
    }
  }

  function removeTag(tag) {
    const index = tags.indexOf(`${cleanImage}:${tagPrefix}${tag}`);
    if (index !== -1) {
      tags.splice(index, 1);
    }

    for (const registry of registryList) {
      const index = tags.indexOf(
        `${registry}/${cleanImage}:${tagPrefix}${tag}`,
      );
      if (index !== -1) {
        tags.splice(index, 1);
      }
    }
  }

  pushTag(version);

  if (branch) {
    if (/^\d+$/.test(branch)) {
      branch = `pr-${branch}`;
    }

    const sanitizedBranch = branch.replace(/[^a-zA-Z0-9._-]/g, "-");

    if (sanitizedBranch !== "main" && sanitizedBranch !== "master") {
      pushTag(sanitizedBranch);
    }
  }

  const isPrBranch =
    branch && (branch.startsWith("pr-") || /^\d+$/.test(branch));

  if (version === "latest") {
    return tags;
  }

  if (
    version.startsWith("sha-") ||
    /^[0-9a-f]{20,40}$/.test(version) ||
    version === "main" ||
    version === "master" ||
    version === "release-candidate" ||
    isPrBranch
  ) {
    removeTag("latest");
    return tags;
  }

  const lowerVersion = version.toLowerCase();
  if (
    lowerVersion.includes("alpha") ||
    lowerVersion.includes("beta") ||
    lowerVersion.includes("rc")
  ) {
    removeTag("latest");
    return tags;
  }

  if (
    version.endsWith("_prod") ||
    version.endsWith("-prod") ||
    version.includes("-feature-")
  ) {
    removeTag("latest");
    return tags;
  }

  if (version.includes("-")) {
    const lastHyphen = version.lastIndexOf("-");
    const appNamePart = version.substring(0, lastHyphen);
    const versionPart = version.substring(lastHyphen + 1);

    if (withLatest) pushTag(`${appNamePart}-latest`);

    if (!/^v?\d+(\.\d+)*$/.test(versionPart)) {
      return tags;
    }

    if (versionPart.startsWith("0") || versionPart.startsWith("v0")) {
      return tags;
    }

    const isVPrefixed = versionPart.startsWith("v");
    const prefix = isVPrefixed ? "v" : "";
    const numericPart = isVPrefixed ? versionPart.substring(1) : versionPart;
    const parts = numericPart.split(".");

    if (parts.length > 2) {
      const majorMinor = `${appNamePart}-${prefix}${parts[0]}.${parts[1]}`;
      if (majorMinor !== version) {
        pushTag(majorMinor);
      }
    }

    if (parts.length > 1) {
      const major = `${appNamePart}-${prefix}${parts[0]}`;
      if (major !== version) {
        pushTag(major);
      }
    }

    return tags;
  }

  if (
    /^\d{8}$/.test(version) ||
    /^\d{4}\.\d{2}\.\d{2}$/.test(version) ||
    /^v\d{4}\.\d{2}\.\d{2}$/.test(version)
  ) {
    if (withLatest) {
      pushTag("latest");
    }
    return tags;
  }

  const isVPrefixed = version.startsWith("v");
  const numericVersion = isVPrefixed ? version.substring(1) : version;
  const parts = numericVersion.split(".");

  if (!isPrBranch && withLatest) {
    pushTag("latest");
  }

  if (parts.length === 1) {
    return tags;
  }

  if (parts[0] === "0") {
    return tags;
  }

  if (parts.length > 2) {
    const majorMinor = `${isVPrefixed ? "v" : ""}${parts[0]}.${parts[1]}`;
    if (majorMinor !== version) {
      pushTag(majorMinor);
    }
  }

  const major = `${isVPrefixed ? "v" : ""}${parts[0]}`;
  if (major !== version) {
    pushTag(major);
  }

  return tags;
}

module.exports = generateTags;
module.exports.__testables = { generateTags };
