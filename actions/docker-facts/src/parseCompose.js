const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");

/**
 * Checks if a compose file exists
 *
 * @param {string} filePath Path to the compose file
 * @returns {string|null} File path if it exists, null otherwise
 */
function composeExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  } catch (error) {
    core.warning(`Error checking compose file: ${error.message}`);
  }
  return null;
}

/**
 * Parse docker-compose file for service configuration
 *
 * @param {string} filePath Path to docker-compose.yml
 * @param {string} imageName Image name to match in docker-compose
 * @param {string} targetName Optional target name to match
 * @returns {Object|null} Build configuration or null if not found
 */
function parseCompose(filePath, imageName, targetName = "") {
  const image = imageName.trim().toLowerCase();

  try {
    const contents = fs.readFileSync(filePath, "utf8");
    const compose = yaml.load(contents);

    if (!compose || !compose.services) {
      core.info(`No services found in compose file`);
      return null;
    }

    const serviceNames = Object.keys(compose.services);
    core.info(`Found services: ${serviceNames.join(", ")}`);

    // First try to find a service with matching target if targetName is provided
    if (targetName) {
      for (const [serviceName, service] of Object.entries(compose.services)) {
        if (!service || !service.build) continue;

        if (
          typeof service.build === "object" &&
          service.build.target === targetName
        ) {
          return getBuildConfig(service.build);
        }
      }
    }

    // Then try to find service by image name
    for (const [serviceName, service] of Object.entries(compose.services)) {
      if (!service) continue;

      const serviceImage = service.image?.toLowerCase() || "";

      if (serviceImage.includes(image) || image.includes(serviceImage)) {
        if (service.build) {
          const buildConfig = getBuildConfig(service.build);
          return buildConfig;
        } else {
          core.info(`Service ${serviceName} has no build configuration`);
        }
      }
    }

    // If still not found, try to find any service with build config
    for (const [serviceName, service] of Object.entries(compose.services)) {
      if (service?.build) {
        const buildConfig = getBuildConfig(service.build);
        return buildConfig;
      }
    }

    core.info(`No matching service found for image ${imageName}`);
  } catch (error) {
    core.warning(`Error parsing compose file: ${error.message}`);
  }

  return null;
}

/**
 * Extract build configuration from docker-compose service
 *
 * @param {string|Object} build Build configuration from compose file
 * @returns {Object} Normalized build configuration
 */
function getBuildConfig(build) {
  if (typeof build === "string") {
    return {
      dockerfile: "Dockerfile",
      context: build,
      args: undefined,
      target: "",
    };
  }

  if (!build.context) {
    core.info("Service has incomplete build configuration (missing context)");
    return {
      dockerfile: build.dockerfile || "Dockerfile",
      context: ".",
      target: build.target || "",
    };
  }

  const context = build.context;
  const dockerfile = build.dockerfile || "Dockerfile";

  return {
    dockerfile,
    context,
    args: build.args,
    target: build.target || "",
  };
}

module.exports = {
  composeExists,
  parseCompose,
};
