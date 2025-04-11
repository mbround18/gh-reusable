const core = require("@actions/core");
const github = require("@actions/github");
const parseLabels = require("./parseLabels");

/**
 * Determines whether to push an image based on GitHub context.
 * We push if:
 * 1. It's a push to the default branch (main/master)
 * 2. It's a push of a tag
 * 3. It's a PR with the canary label
 * 4. Force push is enabled
 *
 * @param {string} canaryLabel - Label name that triggers canary builds on PRs
 * @param {boolean} forcePush - Whether to force push regardless of other conditions
 * @returns {boolean} - True if the image should be pushed
 */
function shouldPushImage(canaryLabel = "canary", forcePush = false) {
  try {
    core.startGroup("Push Decision Logic");

    const context = github.context;
    const eventName = context.eventName;
    const ref = context.ref;
    const defaultBranch = context.payload.repository?.default_branch;

    core.info(`Event: ${eventName}`);
    core.info(`Ref: ${ref}`);
    core.info(`Default branch: ${defaultBranch || "unknown"}`);
    core.info(`Force push: ${forcePush}`);

    if (forcePush === true) {
      core.info("Force push is enabled, will push image.");
      core.endGroup();
      return true;
    }

    if (ref.startsWith("refs/tags/")) {
      core.info("Push event for a tag, will push image.");
      core.endGroup();
      return true;
    }

    if (
      eventName === "push" &&
      defaultBranch &&
      ref === `refs/heads/${defaultBranch}`
    ) {
      core.info(`Push to default branch ${defaultBranch}, will push image.`);
      core.endGroup();
      return true;
    }

    if (eventName === "pull_request") {
      const labels = parseLabels();
      const hasCanaryLabel = labels.some((label) => label === canaryLabel);

      if (hasCanaryLabel) {
        core.info(`PR has '${canaryLabel}' label, will push image.`);
        core.endGroup();
        return true;
      }
      core.info(`PR does not have '${canaryLabel}' label, skipping push.`);
    }

    core.info("No push conditions met, skipping push.");
    core.endGroup();
    return false;
  } catch (error) {
    core.warning(`Error determining push status: ${error.message}`);
    core.endGroup();
    return false;
  }
}

module.exports = shouldPushImage;
