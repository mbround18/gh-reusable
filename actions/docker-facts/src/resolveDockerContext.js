const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const { composeExists, parseCompose } = require("./parseCompose");

/**
 * Resolves the Docker context and Dockerfile for a service
 * by checking for docker-compose.yml/yaml files first, then using defaults
 *
 * @param {string} image The image name to look for in docker-compose
 * @param {string} defaultDockerfile Default Dockerfile path if not found in docker-compose
 * @param {string} defaultContext Default context path if not found in docker-compose
 * @returns {Object} Object with dockerfile and context paths
 */
function resolveDockerContext(image, defaultDockerfile, defaultContext = ".") {
  core.info(`🔍 Docker Context Resolution`);
  core.info(
    `  Inputs: image=${image}, dockerfile=${defaultDockerfile}, context=${defaultContext}`,
  );

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  core.info(`  Workspace: ${workspace}`);

  const ymlPath = path.join(workspace, "docker-compose.yml");
  const yamlPath = path.join(workspace, "docker-compose.yaml");

  let composeFile = composeExists(ymlPath);
  if (!composeFile) {
    composeFile = composeExists(yamlPath);
  }

  if (composeFile) {
    core.info(`  Found compose file: ${composeFile}`);

    try {
      const buildConfig = parseCompose(composeFile, image);

      if (buildConfig) {
        core.info(`  Using configuration from docker-compose for ${image}`);
        core.info(
          `  Dockerfile: ${buildConfig.dockerfile}, Context: ${buildConfig.context}`,
        );
        return {
          dockerfile: buildConfig.dockerfile,
          context: buildConfig.context,
        };
      }

      core.info(`  No matching service found in ${composeFile} for ${image}`);
    } catch (error) {
      core.warning(`Error parsing compose file: ${error.message}`);
    }
  } else {
    core.info(`  No docker-compose file found in ${workspace}`);
  }

  core.info(
    `  Using fallback values: dockerfile=${defaultDockerfile}, context=${defaultContext}`,
  );
  return {
    dockerfile: defaultDockerfile,
    context: defaultContext,
  };
}

module.exports = resolveDockerContext;
