const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");
const path = require("path");

/**
 * Check if a compose file exists
 * @param {string} filePath Path to check
 * @returns {string|null} Full path to compose file or null if not found
 */
function composeExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  } catch (error) {
    core.warning(`Error checking compose file: ${error.message}`);
    return null;
  }
}

/**
 * Parse a compose file and extract build info for a service
 * @param {string} filePath Path to compose file
 * @param {string} imageName Name of the image to find
 * @param {string} target Optional target to match in docker-compose
 * @returns {Object|null} Build config or null if not found
 */
function parseCompose(filePath, imageName, target = "") {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const composeData = yaml.load(content);

    if (!composeData.services) {
      core.info("No services found in compose file");
      return null;
    }

    let serviceName = null;
    let serviceData = null;
    let matchedWithTarget = false;

    // First try to find a service that matches both image and target
    if (target) {
      for (const [name, service] of Object.entries(composeData.services)) {
        // Check if this service matches both image name and target
        if (
          (service.image && service.image.startsWith(imageName)) ||
          name === imageName
        ) {
          if (
            service.build &&
            typeof service.build === "object" &&
            service.build.target === target
          ) {
            serviceName = name;
            serviceData = service;
            matchedWithTarget = true;
            core.info(
              `Found service "${name}" matching both image "${imageName}" and target "${target}"`,
            );
            break;
          }
        }
      }
    }

    // If no match with target, fall back to just matching the image
    if (!serviceName) {
      for (const [name, service] of Object.entries(composeData.services)) {
        if (
          (service.image && service.image.startsWith(imageName)) ||
          name === imageName
        ) {
          serviceName = name;
          serviceData = service;
          core.info(`Found service "${name}" matching image "${imageName}"`);
          break;
        }
      }
    }

    if (!serviceData) {
      core.info(`No matching service found for image ${imageName}`);
      return null;
    }

    // No build configuration in the service
    if (!serviceData.build) {
      core.info(`Service ${serviceName} has no build configuration`);
      return null;
    }

    let buildConfig = {};

    // Handle string build config (just context path)
    if (typeof serviceData.build === "string") {
      buildConfig = {
        context: serviceData.build,
        dockerfile: "Dockerfile",
      };
    }
    // Handle object-style build config
    else if (typeof serviceData.build === "object") {
      if (!serviceData.build.context) {
        core.info(
          `Service ${serviceName} has incomplete build configuration (missing context)`,
        );
        return null;
      }

      buildConfig = {
        context: serviceData.build.context,
        dockerfile: serviceData.build.dockerfile || "Dockerfile",
        args: serviceData.build.args,
      };

      // Include target if it was in the compose file
      if (serviceData.build.target) {
        buildConfig.target = serviceData.build.target;
      }
      // If we matched with target parameter but it wasn't in build config, include it
      else if (matchedWithTarget) {
        buildConfig.target = target;
      }
    } else {
      core.info(`Service ${serviceName} has invalid build configuration type`);
      return null;
    }

    return buildConfig;
  } catch (error) {
    core.warning(`Error parsing compose file: ${error.message}`);
    return null;
  }
}

module.exports = {
  composeExists,
  parseCompose,
};
