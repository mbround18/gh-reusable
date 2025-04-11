const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");

/**
 * Check if compose file exists
 * @param {string} filePath Path to the compose file
 * @returns {string|null} Full path if file exists, null otherwise
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
 * Parse docker-compose file looking for image and extract its build configuration
 * @param {string} composeFile Path to the compose file
 * @param {string} image Image name to look for
 * @returns {Object|null} Object with build configuration or null if not found
 */
function parseCompose(composeFile, image) {
  try {
    const composeContent = fs.readFileSync(composeFile, "utf8");
    const composeData = yaml.load(composeContent);

    if (!composeData || !composeData.services) {
      core.info("No services found in compose file");
      return null;
    }

    const services = Object.keys(composeData.services);
    core.info(`Services found: ${services.join(", ")}`);

    // Find matching service by image name
    let matchingService = null;
    let serviceName = null;

    for (const [name, service] of Object.entries(composeData.services)) {
      if (!service.image) continue;

      // Extract base image name without tag
      const serviceImage = service.image.split(":")[0];
      if (serviceImage === image || service.image.startsWith(image)) {
        matchingService = service;
        serviceName = name;
        break;
      }
    }

    if (!matchingService) {
      core.info(`No matching service found for image ${image}`);
      return null;
    }

    // Check if service has build configuration
    if (!matchingService.build) {
      core.info(`Service ${serviceName} has no build configuration`);
      return null;
    }

    // Build can be a string (context path) or object
    if (typeof matchingService.build === "string") {
      core.info(
        `Found simple build config for ${serviceName}: ${matchingService.build}`,
      );
      return {
        dockerfile: "Dockerfile", // Default
        context: matchingService.build,
      };
    }

    // Build is an object
    if (!matchingService.build.context) {
      core.info(
        `Service ${serviceName} has incomplete build configuration (missing context)`,
      );
      return null;
    }

    core.info(
      `Found build config for ${serviceName}: ${JSON.stringify(matchingService.build)}`,
    );
    return {
      dockerfile: matchingService.build.dockerfile || "Dockerfile",
      context: matchingService.build.context,
      args: matchingService.build.args,
    };
  } catch (error) {
    core.warning(`Error parsing compose file: ${error.message}`);
    return null;
  }
}

module.exports = {
  composeExists,
  parseCompose,
};
