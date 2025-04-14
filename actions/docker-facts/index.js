const core = require("@actions/core");
const github = require("@actions/github");
const { composeExists, parseCompose } = require("./src/parseCompose");
const generateTags = require("./src/generateTags");
const validateTags = require("./src/validateTags");
const resolveDockerContext = require("./src/resolveDockerContext");
const parseGitHubContext = require("./src/parseGitHubContext");
const shouldPushImage = require("./src/shouldPushImage");

/**
 * Main function to run the docker-facts action
 */
async function run() {
  try {
    const image = core.getInput("image");
    const version = core.getInput("version");
    const dockerfile = core.getInput("dockerfile");
    const context = core.getInput("context") || ".";
    const canaryLabel = core.getInput("canary_label") || "canary";
    const registries = core.getInput("registries") || "docker.io";
    const forcePush = core.getInput("force_push") === "true";
    const withLatest = core.getInput("with_latest") === "true";
    const target = core.getInput("target") || "";
    const prepend_target = core.getInput("prepend_target") === "true";

    const dockerContext = resolveDockerContext(
      image,
      dockerfile,
      context,
      target,
    );
    core.setOutput("dockerfile", dockerContext.dockerfile);
    core.setOutput("context", dockerContext.context);

    let branchName = null;
    try {
      const gitHubContext = parseGitHubContext(canaryLabel, forcePush);
      branchName = gitHubContext.branchName;
    } catch (error) {
      core.warning(`Error parsing GitHub context: ${error.message}`);
    }

    core.info(`🏷️ Tag Preparation`);
    const registryList = registries ? registries.split(",") : ["docker.io"];

    // Use the target from docker-compose if it exists and prepend_target is true
    let tagTarget = "";
    if (prepend_target) {
      // Prioritize input target over docker-compose target
      tagTarget = target || dockerContext.target || "";
      if (tagTarget) {
        core.info(`  Using target "${tagTarget}" for tag generation`);
      }
    }

    const tags = generateTags(
      image,
      version,
      branchName,
      registryList,
      withLatest,
      tagTarget, // Use the resolved target
      prepend_target,
    );

    const validatedTags = validateTags(tags);

    const tagsString = validatedTags.join(",");
    core.info(`  Generated tags:\n    ${tagsString.replace(/,/g, "\n    ")}`);
    core.setOutput("tags", tagsString);

    try {
      const push = shouldPushImage(canaryLabel, forcePush);
      core.setOutput("push", push.toString());
    } catch (error) {
      core.warning(`Error determining push status: ${error.message}`);
      core.setOutput("push", forcePush.toString());
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();

module.exports = {
  run,
  __testables: {
    parseCompose,
    composeExists,
    generateTags,
    validateTags,
    resolveDockerContext,
    parseGitHubContext,
    shouldPushImage,
  },
};
