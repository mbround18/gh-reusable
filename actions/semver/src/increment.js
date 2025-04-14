const github = require("@actions/github");
const path = require("path");
const { fetchQuery } = require("./tag");

/**
 * Resolves the increment type based on PR or commit labels
 * @param {Array} labels - Array of label objects with name property
 * @param {string} majorLabel - Label text that indicates a major version bump
 * @param {string} minorLabel - Label text that indicates a minor version bump
 * @param {string} patchLabel - Label text that indicates a patch increment
 * @param {object} core - GitHub Actions core object for logging
 * @returns {string} - The increment type: 'major', 'minor', or 'patch'
 */
function resolveIncrementFromLabels(
  labels,
  majorLabel,
  minorLabel,
  patchLabel,
  core,
) {
  let increment = "patch";

  if (!labels || !labels.length) {
    if (core) core.info("No labels found, defaulting to patch increment");
    return increment;
  }

  const labelNames = labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );

  // Log labels for debugging using core.info instead of console.log
  if (core) {
    core.info(`Checking labels: ${JSON.stringify(labelNames)}`);
    core.info(
      `Looking for major: "${majorLabel}", minor: "${minorLabel}", patch: "${patchLabel}"`,
    );
  }

  if (labelNames.includes(majorLabel)) {
    if (core) core.info(`Found major label: ${majorLabel}`);
    increment = "major";
  } else if (labelNames.includes(minorLabel)) {
    if (core) core.info(`Found minor label: ${minorLabel}`);
    increment = "minor";
  } else if (labelNames.includes(patchLabel)) {
    if (core) core.info(`Found patch label: ${patchLabel}`);
    increment = "patch";
  } else {
    if (core)
      core.info(
        "No matching semver labels found, using default patch increment",
      );
  }

  if (core) core.info(`Resolved increment: ${increment}`);
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
  core.info(`GitHub event name: ${github.context.eventName}`);
  core.info(`GitHub ref: ${github.context.ref}`);
  core.info(`GitHub SHA: ${github.context.sha}`);

  if (incrementInput) {
    core.info(`Using provided increment input: ${incrementInput}`);
    return incrementInput;
  }

  if (github.context.eventName === "pull_request") {
    try {
      core.info("Detecting increment from PR labels...");
      const prNumber = github.context.payload.pull_request.number;
      core.info(`PR number: ${prNumber}`);

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

      return resolveIncrementFromLabels(
        labels,
        majorLabel,
        minorLabel,
        patchLabel,
        core,
      );
    } catch (error) {
      core.warning(`Failed to get PR labels: ${error.message}`);
      return "patch";
    }
  }

  // For commits pushed to branches, check if it's from a merged PR
  try {
    core.info("Detecting increment from commit-associated PR labels...");
    const commitSha = github.context.sha;
    core.info(`Commit SHA: ${commitSha}`);

    const query = await fetchQuery(
      path.join(__dirname, "..", "queries", "commit_associated_pr.gql"),
    );

    core.info("Executing GraphQL query to find associated PR...");
    const result = await octokit.graphql(query, {
      owner,
      repo,
      commitSha,
    });

    core.info(`GraphQL result: ${JSON.stringify(result, null, 2)}`);

    const prs = result.repository.object.associatedPullRequests.nodes;
    if (prs && prs.length > 0) {
      core.info(`Found ${prs.length} associated PRs`);
      const labels = prs[0].labels.nodes;
      core.info(
        `Associated PR labels: ${JSON.stringify(labels.map((l) => l.name))}`,
      );
      return resolveIncrementFromLabels(
        labels,
        majorLabel,
        minorLabel,
        patchLabel,
        core,
      );
    } else {
      core.info("No associated PRs found for this commit");
    }
  } catch (error) {
    core.warning(`Failed to get associated PR labels: ${error.message}`);
    core.info(`Error details: ${error.stack}`);
  }

  core.info("No labels found to determine increment. Using patch as default.");
  return "patch";
}

module.exports = {
  resolveIncrementFromLabels,
  detectIncrement,
};
