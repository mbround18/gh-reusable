const github = require("@actions/github");
const core = require("@actions/core");

/**
 * Extract PR labels from GitHub context
 *
 * @returns {string[]} Array of label names
 */
function parseLabels() {
  // Only PRs have labels
  if (github.context.eventName !== "pull_request") {
    return [];
  }

  try {
    // Extract labels from PR payload
    const labels = github.context.payload.pull_request?.labels || [];

    // Map to label names only
    return labels.map((label) => label.name);
  } catch (error) {
    core.warning(`Error extracting PR labels: ${error.message}`);
    return [];
  }
}

module.exports = parseLabels;
