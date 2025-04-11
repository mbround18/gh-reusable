const core = require("@actions/core");
const github = require("@actions/github");

const { buildNewVersion } = require("./version");
const { resolveIncrementFromLabels, detectIncrement } = require("./increment");
const { fetchQuery, getLastTag } = require("./tag");

/**
 * Main entry point for the GitHub Action
 */
async function run() {
  try {
    // Get inputs
    const token = core.getInput("token") || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GitHub token is required");
    }

    const base = core.getInput("base");
    const prefix = core.getInput("prefix");
    const incrementInput = core.getInput("increment");
    const majorLabel = core.getInput("major-label");
    const minorLabel = core.getInput("minor-label");
    const patchLabel = core.getInput("patch-label");

    // Initialize GitHub client
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // Get last tag or use base
    core.startGroup("🔍 Getting last tag...");
    const { lastTag, updatedPrefix } = await getLastTag(
      octokit,
      owner,
      repo,
      prefix,
      base,
      core,
    );
    core.info(`Last tag: ${lastTag}`);
    core.info(`Prefix: ${updatedPrefix}`);
    core.endGroup();

    // Detect the increment type
    core.startGroup("🏷️ Detecting increment...");
    const increment = await detectIncrement(
      octokit,
      owner,
      repo,
      incrementInput,
      majorLabel,
      minorLabel,
      patchLabel,
      core,
    );
    core.info(`Increment: ${increment}`);
    core.endGroup();

    // Build the new version
    core.startGroup("🚀 Building new version...");
    const isPR = github.context.eventName === "pull_request";
    const newVersion = buildNewVersion(
      lastTag,
      updatedPrefix,
      increment,
      isPR,
      github.context.sha,
    );
    core.info(`New version: ${newVersion}`);
    core.endGroup();

    // Set outputs
    core.setOutput("new_version", newVersion);
  } catch (error) {
    core.setFailed(`💥 ${error.message}`);
  }
}

module.exports = {
  run,
  buildNewVersion,
  resolveIncrementFromLabels,
  fetchQuery,
  getLastTag,
  detectIncrement,
};
