const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function findComposeFile(dirs) {
  const filenames = ["docker-compose.yml", "docker-compose.yaml"];
  for (const dir of dirs) {
    for (const file of filenames) {
      const fullPath = path.join(dir, file);
      if (fs.existsSync(fullPath)) {
        core.info(`Found compose file: ${fullPath}`);
        return fullPath;
      }
    }
  }
  return null;
}

function parseCompose(composePath, image) {
  try {
    const content = fs.readFileSync(composePath, "utf8");
    const doc = yaml.load(content);
    const services = doc.services || {};
    core.info(`Services found: ${Object.keys(services).join(", ")}`);

    const match = Object.values(services).find(
      (svc) =>
        typeof svc.image === "string" && svc.image.startsWith(`${image}:`),
    );

    if (match && match.build?.dockerfile && match.build?.context) {
      core.info(`Matched service for image ${image}`);
      return {
        dockerfile: match.build.dockerfile,
        context: match.build.context,
        args: match.build.args || {},
      };
    }

    core.info(`No matching service found for image ${image}`);
  } catch (err) {
    core.warning(
      `Failed to parse compose file at ${composePath}: ${err.message}`,
    );
  }

  return null;
}

async function run() {
  try {
    const image = core.getInput("image");
    const fallbackDockerfile = core.getInput("dockerfile") || "./Dockerfile";
    const fallbackContext = core.getInput("context") || ".";
    const canaryLabel = core.getInput("canary_label") || "canary";
    const forcePush = core.getInput("force_push").toString() === "true";

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const resolvedContext = path.resolve(fallbackContext);

    core.startGroup("🔍 Docker Context Resolution");

    core.info(
      `Inputs: image=${image}, dockerfile=${fallbackDockerfile}, context=${resolvedContext}`,
    );
    core.info(`Workspace: ${workspace}`);

    let dockerfile = fallbackDockerfile;
    let context = fallbackContext;

    const searchDirs = [resolvedContext];
    if (resolvedContext !== workspace) searchDirs.push(workspace);

    const composePath = findComposeFile(searchDirs);

    if (composePath) {
      const composeDir = path.dirname(composePath);
      process.chdir(composeDir);
      core.info(`Changed working directory to: ${composeDir}`);

      const result = parseCompose(composePath, image);
      if (result) {
        dockerfile = result.dockerfile;
        context = result.context;

        for (const [key, value] of Object.entries(result.args)) {
          core.exportVariable(`BUILD_ARG_${key}`, value);
          core.info(`Exported build arg: BUILD_ARG_${key}=${value}`);
        }
      }
    } else {
      core.info("No docker-compose file found — using fallback values");
    }

    core.info(`Final dockerfile: ${dockerfile}`);
    core.info(`Final context: ${context}`);
    core.endGroup();

    core.setOutput("dockerfile", dockerfile);
    core.setOutput("context", context);

    const { eventName, ref, payload } = github.context;
    const labels = payload.pull_request?.labels || [];
    const defaultBranch = payload.repository?.default_branch || "main";

    const isCanary = labels.some((label) => label.name === canaryLabel);
    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;
    const isTag = ref.startsWith("refs/tags/");

    core.startGroup("📦 GitHub Context & Push Logic");
    core.info(`event=${eventName}, ref=${ref}, defaultBranch=${defaultBranch}`);
    core.info(`labels=[${labels.map((l) => l.name).join(", ")}]`);
    core.info(
      `isCanary=${isCanary}, isDefaultBranch=${isDefaultBranch}, isTag=${isTag}`,
    );
    const shouldPush =
      forcePush ||
      (eventName === "pull_request" && isCanary) ||
      isDefaultBranch ||
      isTag;
    core.info(`push=${shouldPush}`);
    core.endGroup();

    core.setOutput("push", shouldPush ? "true" : "false");
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
