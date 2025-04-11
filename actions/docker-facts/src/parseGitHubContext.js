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
    const eventName = github.context.eventName;
    const ref = github.context.ref;

    const defaultBranch =
      github.context.payload.repository?.default_branch || "main";

    const labels = parseLabels();

    let branchName = null;

    if (eventName === "pull_request") {
      branchName = ref.replace("refs/pull/", "pr-").replace("/merge", "");
    } else if (ref.startsWith("refs/heads/")) {
      branchName = ref.replace("refs/heads/", "");
    }

    const isTag = ref.startsWith("refs/tags/");

    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;

    const isCanary =
      (eventName === "pull_request" && labels.includes(canaryLabel)) ||
      forcePush === true;

    core.info(
      `  event=${eventName}, ref=${ref}, defaultBranch=${defaultBranch}`,
    );
    core.info(`  labels=${JSON.stringify(labels)}`);
    core.info(
      `  isCanary=${isCanary}, isDefaultBranch=${isDefaultBranch}, isTag=${isTag}`,
    );

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
