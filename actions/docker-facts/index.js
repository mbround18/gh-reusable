const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Finds the first docker-compose file in the provided directories.
 * @param {string[]} dirs - Array of directories to search.
 * @returns {string|null} - The compose file path if found, otherwise null.
 */
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

/**
 * Parses the docker-compose file to extract service build configuration for the specified image.
 * @param {string} composePath - The path to the docker-compose file.
 * @param {string} image - The image name to search for.
 * @returns {object|null} - An object containing dockerfile, context, and build args if found.
 */
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

/**
 * Resolves Docker context and dockerfile using a docker-compose file if available, or fallback values.
 * @param {string} image - The Docker image name.
 * @param {string} fallbackDockerfile - The fallback dockerfile path.
 * @param {string} fallbackContext - The fallback context path.
 * @returns {object} - Object containing final dockerfile and context.
 */
function resolveDockerContext(image, fallbackDockerfile, fallbackContext) {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const resolvedContext = path.resolve(fallbackContext);
  let dockerfile = fallbackDockerfile;
  let context = fallbackContext;

  core.startGroup("🔍 Docker Context Resolution");
  core.info(
    `Inputs: image=${image}, dockerfile=${fallbackDockerfile}, context=${resolvedContext}`,
  );
  core.info(`Workspace: ${workspace}`);

  const searchDirs = [resolvedContext];
  if (resolvedContext !== workspace) {
    searchDirs.push(workspace);
  }

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

  return { dockerfile, context };
}

/**
 * Generates Docker tags based on the version, registries, and optional cascading versions.
 * @param {string} image - The image name.
 * @param {string} version - The version string.
 * @param {string[]} registries - Array of registry prefixes.
 * @param {string} cascadingVersionsInput - JSON string of cascading versions.
 * @returns {string[]} - Array of generated tags.
 */
function generateTags(image, version, registries, cascadingVersionsInput) {
  const tags = [`${image}:${version}`];
  registries.forEach((registry) => {
    tags.push(`${registry}/${image}:${version}`);
  });

  // Determine if there's a suffix (non-numeric characters after stripping an optional leading "v")
  const hasSuffix = /[^0-9.]/.test(version.replace(/^v/, ""));
  if (cascadingVersionsInput && !hasSuffix) {
    try {
      const cascadeVersions = JSON.parse(cascadingVersionsInput);
      cascadeVersions.forEach((cascadeVersion) => {
        if (cascadeVersion !== version) {
          tags.push(`${image}:${cascadeVersion}`);
          registries.forEach((registry) => {
            tags.push(`${registry}/${image}:${cascadeVersion}`);
          });
        }
      });
    } catch (error) {
      core.warning(
        `Failed to parse cascading_versions input: ${error.message}`,
      );
    }
  } else if (hasSuffix) {
    core.info("Skipping cascading tags due to detected version suffix.");
  }
  return tags;
}

/**
 * Determines whether the Docker image should be pushed based on GitHub context.
 * @param {string} canaryLabel - The label that designates canary releases.
 * @param {boolean} forcePush - Whether push is forced.
 * @returns {boolean} - True if the image should be pushed.
 */
function shouldPushImage(canaryLabel, forcePush) {
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

  const pushDecision =
    forcePush ||
    (eventName === "pull_request" && isCanary) ||
    isDefaultBranch ||
    isTag;
  core.info(`Push decision: ${pushDecision}`);
  core.endGroup();
  return pushDecision;
}

async function run() {
  try {
    // Retrieve required inputs.
    const image = core.getInput("image");
    const version = core.getInput("version");
    const registries = core
      .getInput("registries")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const fallbackDockerfile = core.getInput("dockerfile") || "./Dockerfile";
    const fallbackContext = core.getInput("context") || ".";
    const canaryLabel = core.getInput("canary_label") || "canary";
    const forcePush = core.getInput("force_push").toString() === "true";
    const cascadingVersionsInput = core.getInput("cascading_versions") || "";

    // Resolve the Docker context.
    const { dockerfile, context } = resolveDockerContext(
      image,
      fallbackDockerfile,
      fallbackContext,
    );
    core.setOutput("dockerfile", dockerfile);
    core.setOutput("context", context);

    // Generate Docker tags.
    core.startGroup("🏷️ Tag Preparation");
    const tags = generateTags(
      image,
      version,
      registries,
      cascadingVersionsInput,
    );
    core.setOutput("tags", tags.join(","));
    core.info("Generated tags:");
    tags.forEach((tag) => core.info(`  ${tag}`));
    core.endGroup();

    // Determine push conditions.
    const push = shouldPushImage(canaryLabel, forcePush);
    core.setOutput("push", push ? "true" : "false");
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  __testables: {
    findComposeFile,
    parseCompose,
    resolveDockerContext,
    generateTags,
    shouldPushImage,
  },
};
