const core = require("@actions/core");
const github = require("@actions/github");
const parseLabels = require("./parseLabels");

/**
 * Parse GitHub context and determine if we should push the image
 *
 * @param {string} canaryLabel Label that triggers canary builds
 * @param {boolean} forcePush Whether to force push the image
 * @returns {Object} Object with GitHub context information and push decision
 */
function parseGitHubContext(canaryLabel = "canary", forcePush = false) {
  core.info(`📦 GitHub Context & Push Logic`);

  try {
    // Extract the context details
    const eventName = github.context.eventName;
    const ref = github.context.ref;

    // Default branch detection
    const defaultBranch =
      github.context.payload.repository?.default_branch || "main";

    // Extract pull request labels if available
    const labels = parseLabels();

    // Determine branch name for tagging
    let branchName = null;

    // PR event
    if (eventName === "pull_request") {
      branchName = ref.replace("refs/pull/", "pr-").replace("/merge", "");
    }
    // Push to a branch
    else if (ref.startsWith("refs/heads/")) {
      branchName = ref.replace("refs/heads/", "");
    }

    // Determine if this is a tag push
    const isTag = ref.startsWith("refs/tags/");

    // Default branch detection
    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;

    // Canary detection - either has the canary label or force push is enabled
    const isCanary =
      (eventName === "pull_request" && labels.includes(canaryLabel)) ||
      forcePush === true;

    // Log the context for debugging
    core.info(
      `  event=${eventName}, ref=${ref}, defaultBranch=${defaultBranch}`,
    );
    core.info(`  labels=${JSON.stringify(labels)}`);
    core.info(
      `  isCanary=${isCanary}, isDefaultBranch=${isDefaultBranch}, isTag=${isTag}`,
    );

    // Determine if we should push the image
    // Push if: default branch, tag, or canary label/force push
    const shouldPush = isDefaultBranch || isTag || isCanary;
    core.info(`  Push decision: ${shouldPush}`);

    return {
      eventName,
      ref,
      defaultBranch,
      branchName,
      labels,
      isDefaultBranch,
      isCanary,
      isTag,
      push: shouldPush,
    };
  } catch (error) {
    core.warning(`Error parsing GitHub context: ${error.message}`);
    // Return default values on error
    return {
      eventName: "unknown",
      ref: "",
      defaultBranch: "main",
      branchName: null,
      labels: [],
      isDefaultBranch: false,
      isCanary: false,
      isTag: false,
      push: forcePush,
    };
  }
}

module.exports = parseGitHubContext;
