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
    const tagVersionPart =
      prefix && tagName.startsWith(prefix)
        ? tagName.substring(prefix.length)
        : tagName;
    if (!semver.valid(tagVersionPart)) {
      throw new Error(`Tag "${tagName}" is not a valid semantic version`);
    }
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

  const validIncrements = ["major", "minor", "patch"];
  if (increment && !validIncrements.includes(increment)) {
    throw new Error(
      `Failed to increment version: ${versionPart}. Invalid increment type: ${increment}`,
    );
  }

  // If this is a PR, create a prerelease version with the commit SHA
  if (isPR) {
    // Extract the short SHA (first 7 characters)
    const shortSha = sha.substring(0, 7);

    const nextVersion = increment
      ? semver.inc(parsed, increment)
      : `${parsed.major}.${parsed.minor}.${parsed.patch}`;

    return `${prefix}${nextVersion}-pr.${shortSha}`;
  }

  // For regular (non-PR) builds, increment the version
  let newVersion;

  // Validate increment type
  if (!validIncrements.includes(increment)) {
    throw new Error(
      `Failed to increment version: ${versionPart}. Invalid increment type: ${increment}`,
    );
  }

  newVersion = semver.inc(parsed, increment);

  if (!newVersion) {
    throw new Error(`Failed to increment version: ${versionPart}`);
  }

  return `${prefix}${newVersion}`;
}

module.exports = {
  buildNewVersion,
};
