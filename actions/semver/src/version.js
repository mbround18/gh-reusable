const github = require("@actions/github");
const semver = require("semver");

/**
 * Builds a new version based on the given parameters
 * @param {string} lastTag - Last tag version
 * @param {string} prefix - Version prefix
 * @param {string} increment - Increment type (major, minor, patch)
 * @param {boolean} isPR - Whether this is a PR build
 * @param {string} sha - Commit SHA
 * @param {object} core - GitHub Actions core object (optional, for logging)
 * @returns {string} - New version
 */
function buildNewVersion(lastTag, prefix, increment, isPR, sha, core = null) {
  // Log the input parameters if core is provided
  if (core) {
    core.startGroup("Building new version");
    core.info(`Last tag: ${lastTag}`);
    core.info(`Prefix: ${prefix}`);
    core.info(`Increment: ${increment}`);
    core.info(`Is PR: ${isPR}`);
    core.info(`SHA: ${sha}`);
    core.info(`GitHub ref: ${process.env.GITHUB_REF || "not set"}`);
    core.endGroup();
  }

  // Check if we're running on a tag, if so return the tag name
  const ref = process.env.GITHUB_REF || "";
  if (ref.startsWith("refs/tags/")) {
    const tagName = ref.replace("refs/tags/", "");
    if (core)
      core.info(`Running on tag: ${tagName}, returning exactly this tag`);
    return tagName;
  }

  // Extract the version without prefix
  const versionPart = lastTag.startsWith(prefix)
    ? lastTag.substring(prefix.length)
    : lastTag;

  // Parse the version
  const parsed = semver.parse(versionPart);
  if (!parsed) {
    throw new Error(`Invalid semver: ${versionPart}`);
  }

  // If this is a PR, create a prerelease version with the commit SHA
  if (isPR) {
    // Extract the short SHA (first 7 characters)
    const shortSha = sha.substring(0, 7);

    // Handle major, minor, patch labels for PRs too
    let nextVersion;
    if (increment === "major") {
      nextVersion = semver.inc(parsed, "major");
    } else if (increment === "minor") {
      nextVersion = semver.inc(parsed, "minor");
    } else if (increment === "patch") {
      nextVersion = semver.inc(parsed, "patch");
    } else {
      // If no increment type specified for PR, just use current version
      nextVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    }

    return `${prefix}${nextVersion}-${shortSha}`;
  }

  // For regular (non-PR) builds, increment the version
  let newVersion;

  // Validate increment type
  const validIncrements = ["major", "minor", "patch"];
  if (!validIncrements.includes(increment)) {
    throw new Error(
      `Failed to increment version: ${versionPart}. Invalid increment type: ${increment}`,
    );
  }

  if (increment === "major") {
    newVersion = semver.inc(parsed, "major");
  } else if (increment === "minor") {
    newVersion = semver.inc(parsed, "minor");
  } else if (increment === "patch") {
    newVersion = semver.inc(parsed, "patch");
  }

  if (!newVersion) {
    throw new Error(`Failed to increment version: ${versionPart}`);
  }

  return `${prefix}${newVersion}`;
}

module.exports = {
  buildNewVersion,
};
