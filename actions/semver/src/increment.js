const github = require("@actions/github");
const path = require("path");
const { fetchQuery } = require("./tag");

/**
 * Resolves the increment type based on PR or commit labels
 * @param {Array} labels - Array of label objects with name property
 * @param {string} majorLabel - Label text that indicates a major version bump
 * @param {string} minorLabel - Label text that indicates a minor version bump
 * @returns {string} - The increment type: 'major', 'minor', or 'patch'
 */
function resolveIncrementFromLabels(labels, majorLabel, minorLabel) {
  let increment = "patch";

  if (!labels || !labels.length) {
    return increment;
  }

  const labelNames = labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );

  if (labelNames.includes(majorLabel)) {
    increment = "major";
  } else if (labelNames.includes(minorLabel)) {
    increment = "minor";
  }

  return increment;
}

/**
 * Detects the increment type based on input or PR/commit labels
 * @param {object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} incrementInput - User-provided increment input
 * @param {string} majorLabel - Label for major increments
 * @param {string} minorLabel - Label for minor increments
 * @param {string} patchLabel - Label for patch increments
 * @param {object} core - GitHub Actions core object
 * @returns {string} - The increment type: 'major', 'minor', or 'patch'
 */
async function detectIncrement(
  octokit,
  owner,
  repo,
  incrementInput,
  majorLabel,
  minorLabel,
  patchLabel,
  core,
) {
  if (incrementInput) {
    return incrementInput;
  }

  if (github.context.eventName === "pull_request") {
    try {
      core.info("Detecting increment from PR labels...");
      const prNumber = github.context.payload.pull_request.number;

      const query = await fetchQuery(
        path.join(__dirname, "..", "queries", "pr_labels.gql"),
      );

      const result = await octokit.graphql(query, {
        owner,
        repo,
        prNumber,
      });

      const labels = result.repository.pullRequest.labels.nodes;
      core.info(`PR labels: ${JSON.stringify(labels.map((l) => l.name))}`);

      return resolveIncrementFromLabels(labels, majorLabel, minorLabel);
    } catch (error) {
      core.warning(`Failed to get PR labels: ${error.message}`);
      return "patch";
    }
  }

  try {
    core.info("Detecting increment from commit-associated PR labels...");
    const commitSha = github.context.sha;

    const query = await fetchQuery(
      path.join(__dirname, "..", "queries", "commit_associated_pr.gql"),
    );

    const result = await octokit.graphql(query, {
      owner,
      repo,
      commitSha,
    });

    const prs = result.repository.object.associatedPullRequests.nodes;
    if (prs && prs.length > 0) {
      const labels = prs[0].labels.nodes;
      core.info(
        `Associated PR labels: ${JSON.stringify(labels.map((l) => l.name))}`,
      );
      return resolveIncrementFromLabels(labels, majorLabel, minorLabel);
    }
  } catch (error) {
    core.warning(`Failed to get associated PR labels: ${error.message}`);
  }

  core.info("No labels found to determine increment. Using patch as default.");
  return "patch";
}

module.exports = {
  resolveIncrementFromLabels,
  detectIncrement,
};
