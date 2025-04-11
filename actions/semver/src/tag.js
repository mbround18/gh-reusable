const fs = require("fs");
const path = require("path");
const semver = require("semver");

// Query cache to avoid reading files multiple times
const queryCache = new Map();

/**
 * Fetches and caches GraphQL query files
 * @param {string} filePath - Path to the GraphQL query file
 * @returns {Promise<string>} - The query content
 */
async function fetchQuery(filePath) {
  // Check the cache first
  if (queryCache.has(filePath)) {
    return queryCache.get(filePath);
  }

  // Read and cache the query
  const queryContent = await fs.promises.readFile(filePath, "utf8");
  queryCache.set(filePath, queryContent);
  return queryContent;
}

/**
 * Gets the last tag from the repository or uses the provided base tag
 * @param {object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} prefix - Version prefix
 * @param {string} base - Base version to use instead of last tag
 * @param {object} core - GitHub Actions core object
 * @returns {Promise<object>} - Object containing the last tag and updated prefix
 */
async function getLastTag(octokit, owner, repo, prefix, base, core) {
  // Check if we're running on a tag and return it if so
  const ref = process.env.GITHUB_REF || "";
  if (ref.startsWith("refs/tags/")) {
    const tagName = ref.replace("refs/tags/", "");
    core.info(`Running on tag: ${tagName}`);
    return { lastTag: tagName, updatedPrefix: prefix };
  }

  // If base version is provided, use it
  if (base) {
    return { lastTag: base, updatedPrefix: prefix };
  }

  try {
    // Fetch all tags
    core.info("Fetching tags from repository...");
    const query = await fetchQuery(
      path.join(__dirname, "..", "queries", "get_last_tag.gql"),
    );

    const result = await octokit.graphql(query, { owner, repo });

    // Ensure the result has the expected structure
    if (
      !result.repository ||
      !result.repository.refs ||
      !result.repository.refs.nodes
    ) {
      throw new Error("Failed to fetch last tag information");
    }

    const tags = result.repository.refs.nodes.map((node) => node.name);
    core.info(`Found ${tags.length} tags: ${tags.join(", ")}`);

    // If no tags found, return default version with prefix
    if (tags.length === 0) {
      return { lastTag: `${prefix || "v"}0.0.0`, updatedPrefix: prefix || "v" };
    }

    // If prefix wasn't provided but all tags start with 'v', use 'v' as prefix
    let updatedPrefix = prefix;
    if (!prefix && tags.every((tag) => tag.startsWith("v"))) {
      updatedPrefix = "v";
    }

    // Filter tags by prefix
    const filteredTags = updatedPrefix
      ? tags.filter((tag) => tag.startsWith(updatedPrefix))
      : tags;

    // If no matching tags, return default version with prefix
    if (filteredTags.length === 0) {
      return {
        lastTag: `${updatedPrefix || "v"}0.0.0`,
        updatedPrefix: updatedPrefix || "v",
      };
    }

    // Sort tags by semver version, properly handling prefixes
    const sortedTags = [...filteredTags].sort((a, b) => {
      // Extract the semver part after the prefix
      const aVersion = a.startsWith(updatedPrefix)
        ? a.substring(updatedPrefix.length)
        : a;
      const bVersion = b.startsWith(updatedPrefix)
        ? b.substring(updatedPrefix.length)
        : b;

      // Fix for tags with dashes: make sure we parse version numbers correctly
      const aParts = aVersion.split("-");
      const bParts = bVersion.split("-");

      // Get clean semver for comparison, focusing on the numeric part
      const aSemver = semver.valid(semver.coerce(aParts[0])) || "0.0.0";
      const bSemver = semver.valid(semver.coerce(bParts[0])) || "0.0.0";

      // Compare versions (reversed for descending order)
      const versionCompare = semver.compare(bSemver, aSemver);

      // If versions are same but one has a prerelease tag, prioritize the one without
      if (versionCompare === 0) {
        const aIsPrerelease = aParts.length > 1;
        const bIsPrerelease = bParts.length > 1;

        if (aIsPrerelease && !bIsPrerelease) return 1;
        if (!aIsPrerelease && bIsPrerelease) return -1;
      }

      return versionCompare;
    });

    // The last tag is the highest version (first after sorting)
    const lastTag = sortedTags[0];
    core.info(`Last tag: ${lastTag}`);

    // If used a dash as part of prefix, make sure it's included
    if (
      updatedPrefix &&
      !updatedPrefix.endsWith("-") &&
      lastTag.includes("-")
    ) {
      const actualPrefix = lastTag.substring(0, lastTag.lastIndexOf("-") + 1);
      if (actualPrefix.startsWith(updatedPrefix)) {
        updatedPrefix = actualPrefix;
      }
    }

    return { lastTag, updatedPrefix: updatedPrefix || "" };
  } catch (error) {
    // Use core.warning if available, otherwise fallback to console.warn
    if (core && typeof core.warning === "function") {
      core.warning(`Error fetching tags: ${error.message}`);
    } else {
      console.warn(`Error fetching tags: ${error.message}`);
    }
    throw new Error(`Failed to fetch last tag information: ${error.message}`);
  }
}

module.exports = {
  fetchQuery,
  getLastTag,
};
