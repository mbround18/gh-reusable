const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const semver = require("semver");

/**
 * Parses a Docker image name into its components.
 * @param {string} imageName - The full docker image name to parse.
 * @returns {object} - The parsed components of the image name.
 */
function parseDockerImageName(imageName) {
  // Fixed regex with proper escaping
  const regex =
    /^(?:(?<registry>[a-zA-Z0-9.-]+(?::[0-9]+)?)\/)??(?:(?<namespace>[a-z0-9]+(?:[._-][a-z0-9]+)*)\/)??(?<repository>[a-z0-9]+(?:[._-][a-z0-9]+)*)(?::(?<tag>[\w][\w.-]{0,127}))?(?:@(?<digest>[A-Za-z][A-Za-z0-9]*:[0-9a-fA-F]{32,}))?$/;
  const match = imageName.match(regex);
  if (!match || !match.groups) {
    throw new Error("Invalid Docker image name");
  }
  return {
    registry: match.groups.registry || null,
    namespace: match.groups.namespace || null,
    repository: match.groups.repository,
    tag: match.groups.tag || "latest",
    digest: match.groups.digest || null,
  };
}

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
    core.info(`Found compose file at: ${composePath}`);

    try {
      process.chdir(composeDir);
      core.info(`Changed working directory to: ${composeDir}`);

      const result = parseCompose(composePath, image);
      if (result) {
        dockerfile = result.dockerfile;
        context = result.context;

        for (const [key, value] of Object.entries(result.args || {})) {
          core.exportVariable(`BUILD_ARG_${key}`, value);
          core.info(`Exported build arg: BUILD_ARG_${key}=${value}`);
        }
        core.info(
          `Using compose configuration: dockerfile=${dockerfile}, context=${context}`,
        );
      } else {
        core.info(
          "No matching service found in compose file — using fallback values",
        );
      }
    } catch (err) {
      core.warning(
        `Failed to parse compose file at ${composePath}: ${err.message}`,
      );
      dockerfile = fallbackDockerfile;
      context = fallbackContext;
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
 * @returns {string[]} - Array of generated tags.
 */
function generateTags(image, version, registries) {
  const tags = new Set(); // Use Set to prevent duplicate tags
  
  // Parse the version to handle semantic versioning properly
  const hasVPrefix = version.startsWith('v');
  const cleanVersion = hasVPrefix ? version.substring(1) : version;
  
  // Try to extract semantic version from potentially complex version string
  const semverMatch = cleanVersion.match(/(\d+)\.(\d+)\.(\d+)/);
  const majorMinorMatch = cleanVersion.match(/(\d+)\.(\d+)$/);
  const majorOnlyMatch = cleanVersion.match(/^(\d+)$/);
  
  const parsedVersion = semver.valid(semver.coerce(cleanVersion));
  const hasSuffix = /[^0-9.]/.test(cleanVersion) && !hasVPrefix;
  
  // Check if the version has an app name prefix (e.g., app-name-1.0.0)
  const appNameMatch = version.match(/^(.+?)[-_](\d+\.\d+\.\d+|v\d+\.\d+\.\d+|\d+\.\d+|v\d+\.\d+|\d+|v\d+)$/);
  const appName = appNameMatch ? appNameMatch[1] : null;
  const versionPart = appNameMatch ? appNameMatch[2] : version;
  
  // Validate image name
  let cleanImage = image;
  try {
    const imageInfo = parseDockerImageName(image);
    cleanImage = imageInfo.namespace ? 
      `${imageInfo.namespace}/${imageInfo.repository}` : 
      imageInfo.repository;
  } catch (error) {
    core.warning(`Invalid image name format: ${image}, using as-is`);
  }
  
  // Add the primary version tags (preserving 'v' prefix if present)
  tags.add(`${cleanImage}:${version}`);
  registries.forEach((registry) => {
    tags.add(`${registry}/${cleanImage}:${version}`);
  });

  // Add latest tags only if the version doesn't have a suffix
  const hasSuffixForLatest = hasVPrefix ? 
    version.slice(1).match(/[^0-9.]/) : 
    version.match(/[^0-9.]/);
    
  if (!hasSuffixForLatest || version === "latest") {
    tags.add(`${cleanImage}:latest`);
    registries.forEach((registry) => {
      tags.add(`${registry}/${cleanImage}:latest`);
    });
  } else {
    core.info(`Version ${version} has a suffix. Skipping 'latest' tag.`);
  }
  
  // Add app-name specific tags if needed
  if (appName) {
    // Add app-name-latest tag
    const appNameLatest = `${appName}-latest`;
    tags.add(`${cleanImage}:${appNameLatest}`);
    registries.forEach((registry) => {
      tags.add(`${registry}/${cleanImage}:${appNameLatest}`);
    });
    
    // If version part has semantic versioning, add cascading tags
    if (semver.valid(semver.coerce(versionPart))) {
      const hasInnerVPrefix = versionPart.startsWith('v');
      const cleanVersionPart = hasInnerVPrefix ? versionPart.substring(1) : versionPart;
      
      // If we have a full semver (x.y.z)
      if (cleanVersionPart.match(/\d+\.\d+\.\d+/)) {
        const major = semver.major(semver.coerce(cleanVersionPart));
        const minor = semver.minor(semver.coerce(cleanVersionPart));
        
        if (major > 0 || minor > 0) {
          // Add app-name-x.y tag
          const majorMinor = hasInnerVPrefix ? `v${major}.${minor}` : `${major}.${minor}`;
          const appNameMajorMinor = `${appName}-${majorMinor}`;
          tags.add(`${cleanImage}:${appNameMajorMinor}`);
          registries.forEach((registry) => {
            tags.add(`${registry}/${cleanImage}:${appNameMajorMinor}`);
          });
          
          // Add app-name-x tag
          const majorOnly = hasInnerVPrefix ? `v${major}` : `${major}`;
          const appNameMajor = `${appName}-${majorOnly}`;
          tags.add(`${cleanImage}:${appNameMajor}`);
          registries.forEach((registry) => {
            tags.add(`${registry}/${cleanImage}:${appNameMajor}`);
          });
        }
      }
    }
    
    // Skip further tag generation for versions with app name prefix
    return Array.from(tags);
  }
  
  // Skip further tag generation for complex versions with suffix
  if (hasSuffix && !version.match(/^v?\d+\.\d+$/) && !version.match(/^v?\d+$/)) {
    core.info(`Version ${version} has a suffix. Skipping PR/branch and cascading tags.`);
    return Array.from(tags);
  }
  
  // Add branch or PR specific tags
  const { eventName, ref, payload } = github.context;
  if (eventName === "pull_request") {
    const prNumber = payload.pull_request?.number;
    if (prNumber) {
      const prTag = `pr-${prNumber}`;
      tags.add(`${cleanImage}:${prTag}`);
      registries.forEach((registry) => {
        tags.add(`${registry}/${cleanImage}:${prTag}`);
      });
    }
  } else if (ref && ref.startsWith("refs/heads/")) {
    const branch = ref
      .replace("refs/heads/", "")
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    if (branch && branch !== "main" && branch !== "master") {
      tags.add(`${cleanImage}:${branch}`);
      registries.forEach((registry) => {
        tags.add(`${registry}/${cleanImage}:${branch}`);
      });
    }
  }
  
  // Generate cascading versions based on semver
  if (parsedVersion) {
    const major = semver.major(parsedVersion);
    const minor = semver.minor(parsedVersion);
    
    // Handle v-prefixed versions with special treatment
    if (hasVPrefix) {
      // Handle v-prefixed semver (v1.0.0) or major.minor version (v1.2)
      if (semverMatch || majorMinorMatch) {
        // Add v-prefixed cascading tags only
        const vMajorMinorTag = `v${major}.${minor}`;
        if (version !== vMajorMinorTag) {
          tags.add(`${cleanImage}:${vMajorMinorTag}`);
          registries.forEach((registry) => {
            tags.add(`${registry}/${cleanImage}:${vMajorMinorTag}`);
          });
        }
        
        const vMajorTag = `v${major}`;
        if (version !== vMajorTag && vMajorTag !== vMajorMinorTag) {
          tags.add(`${cleanImage}:${vMajorTag}`);
          registries.forEach((registry) => {
            tags.add(`${registry}/${cleanImage}:${vMajorTag}`);
          });
        }
        
        // Remove previous behavior that added non-prefixed versions
      }
      // Handle v-prefixed major only version (v1)
      else if (majorOnlyMatch) {
        // Nothing to do here - we already have the v-prefixed major version tag
      }
    } 
    // Regular handling for non-prefixed versions
    else if (major > 0) {
      // Special case for versions that are already in minimal form (e.g., "1")
      if (version === String(major)) {
        core.info(`Version ${version} is already in minimal form. Skipping cascading tags.`);
        return Array.from(tags);
      }
      
      // Add major.minor tag
      const majorMinorTag = `${major}.${minor}`;
      if (version !== majorMinorTag) {
        tags.add(`${cleanImage}:${majorMinorTag}`);
        registries.forEach((registry) => {
          tags.add(`${registry}/${cleanImage}:${majorMinorTag}`);
        });
      }
      
      // Add major tag
      const majorTag = `${major}`;
      if (version !== majorTag && majorTag !== majorMinorTag) {
        tags.add(`${cleanImage}:${majorTag}`);
        registries.forEach((registry) => {
          tags.add(`${registry}/${cleanImage}:${majorTag}`);
        });
      }
    } else {
      core.info("Skipping cascading tags for zero-prefixed version.");
    }
  } else {
    core.info(`Could not parse "${version}" as semver. Skipping cascading tags.`);
  }
  
  return Array.from(tags);
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
    const tags = generateTags(image, version, registries);
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
    parseDockerImageName,
  },
};
