const github = require("@actions/github");
const core = require("@actions/core");

/**
 * Extract PR labels from GitHub context
 *
 * @returns {string[]} Array of label names
 */
function parseLabels() {
  if (github.context.eventName !== "pull_request") {
    return [];
  }

  try {
    const labels = github.context.payload.pull_request?.labels || [];

    return labels.map((label) => label.name);
  } catch (error) {
    core.warning(`Error extracting PR labels: ${error.message}`);
    return [];
  }
}

module.exports = parseLabels;
