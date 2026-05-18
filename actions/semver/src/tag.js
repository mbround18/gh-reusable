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
      const defaultPrefix = prefix !== undefined ? prefix : "v";
      return { lastTag: `${defaultPrefix}0.0.0`, updatedPrefix: defaultPrefix };
    }

    // If prefix wasn't provided but all tags start with 'v', use 'v' as prefix
    let updatedPrefix = prefix;
    if (prefix === undefined && tags.every((tag) => tag.startsWith("v"))) {
      updatedPrefix = "v";
    }

    const buildCandidateSet = (candidatePrefix) =>
      tags
        .filter((tag) =>
          candidatePrefix ? tag.startsWith(candidatePrefix) : true,
        )
        .map((tag) => {
          const versionPart = candidatePrefix
            ? tag.substring(candidatePrefix.length)
            : tag;
          const parsedVersion = semver.valid(versionPart);
          if (!parsedVersion) {
            return null;
          }

          return {
            tag,
            version: parsedVersion,
          };
        })
        .filter(Boolean);

    const prefixCandidates = new Set([updatedPrefix || ""]);
    if (updatedPrefix && !updatedPrefix.endsWith("-")) {
      prefixCandidates.add(`${updatedPrefix}-`);
    }

    let selectedPrefix = updatedPrefix || "";
    let semverTags = [];
    for (const candidatePrefix of prefixCandidates) {
      const candidateTags = buildCandidateSet(candidatePrefix);
      if (candidateTags.length > semverTags.length) {
        semverTags = candidateTags;
        selectedPrefix = candidatePrefix;
      }
    }

    if (semverTags.length === 0) {
      const defaultPrefix = updatedPrefix !== undefined ? updatedPrefix : "v";
      return {
        lastTag: `${defaultPrefix}0.0.0`,
        updatedPrefix: defaultPrefix,
      };
    }

    semverTags.sort((a, b) => semver.rcompare(a.version, b.version));
    const lastTag = semverTags[0].tag;
    updatedPrefix = selectedPrefix;
    core.info(`Last tag: ${lastTag}`);

    return {
      lastTag,
      updatedPrefix: updatedPrefix !== undefined ? updatedPrefix : "",
    };
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
