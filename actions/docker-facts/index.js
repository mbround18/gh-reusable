const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const yaml = require("js-yaml");

async function run() {
  try {
    const image = core.getInput("image");
    const fallbackDockerfile = core.getInput("dockerfile") || "./Dockerfile";
    const fallbackContext = core.getInput("context") || ".";
    const canaryLabel = core.getInput("canary_label") || "canary";

    let dockerfile = fallbackDockerfile;
    let context = fallbackContext;

    try {
      const file = fs.readFileSync("docker-compose.yml", "utf8");
      const doc = yaml.load(file);
      const services = doc.services || {};

      const match = Object.values(services).find(
        (svc) =>
          typeof svc.image === "string" && svc.image.startsWith(`${image}:`),
      );

      if (match && match.build?.dockerfile && match.build?.context) {
        dockerfile = match.build.dockerfile;
        context = match.build.context;

        const args = match.build.args || {};
        for (const [key, value] of Object.entries(args)) {
          core.exportVariable(`BUILD_ARG_${key}`, value);
        }
      } else {
        core.info(
          `No matching service found in docker-compose.yml for image ${image}: — falling back`,
        );
      }
    } catch (e) {
      core.info(`No docker-compose.yml found — falling back`);
    }

    core.setOutput("dockerfile", dockerfile);
    core.setOutput("context", context);

    const eventName = github.context.eventName;
    const ref = github.context.ref;
    const labels = github.context.payload.pull_request?.labels || [];
    const defaultBranch =
      github.context.payload.repository?.default_branch || "main";

    const isCanary = labels.some((label) => label.name === canaryLabel);
    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;
    const isTag = ref.startsWith("refs/tags/");

    const shouldPush =
      (eventName === "pull_request" && isCanary) || isDefaultBranch || isTag;

    core.setOutput("push", shouldPush ? "true" : "false");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
