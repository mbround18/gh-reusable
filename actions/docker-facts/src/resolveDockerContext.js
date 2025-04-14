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
 * @param {string} target Optional target to match in docker-compose
 * @returns {Object} Object with dockerfile and context paths
 */
function resolveDockerContext(
  image,
  defaultDockerfile,
  defaultContext = ".",
  target = "",
) {
  core.info(`🔍 Docker Context Resolution`);
  core.info(
    `  Inputs: image=${image}, dockerfile=${defaultDockerfile}, context=${defaultContext}, target=${target || "none"}`,
  );

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  core.info(`  Workspace: ${workspace}`);

  const ymlPath = path.join(workspace, defaultContext, "docker-compose.yml");
  const yamlPath = path.join(workspace, defaultContext, "docker-compose.yaml");
  const composePath = path.join(workspace, defaultContext,"compose.yml");
  const composePathYaml = path.join(workspace, defaultContext, "compose.yaml");

  let composeFile = composeExists(ymlPath);
  if (!composeFile) {
    composeFile = composeExists(yamlPath);
  }
  if (!composeFile) {
    composeFile = composeExists(composePath);
  }
  if (!composeFile) {
    composeFile = composeExists(composePathYaml);
  }

  if (composeFile) {
    core.info(`  Found compose file: ${composeFile}`);

    try {
      // Pass target to parseCompose for matching in docker-compose
      const buildConfig = parseCompose(composeFile, image, target);

      if (buildConfig) {
        core.info(`  Using configuration from docker-compose for ${image}`);
        core.info(
          `  Dockerfile: ${buildConfig.dockerfile}, Context: ${buildConfig.context}`,
        );

        // If target was provided and not already in buildConfig, include it
        if (target && !buildConfig.target) {
          buildConfig.target = target;
          core.info(`  Target: ${target} (from input)`);
        } else if (buildConfig.target) {
          core.info(`  Target: ${buildConfig.target} (from docker-compose)`);
        }

        return {
          dockerfile: buildConfig.dockerfile,
          context: buildConfig.context,
          target: buildConfig.target,
        };
      }

      core.info(
        `  No matching service found in ${composeFile} for ${image}${target ? ` with target ${target}` : ""}`,
      );
    } catch (error) {
      core.warning(`Error parsing compose file: ${error.message}`);
    }
  } else {
    core.info(`  No docker-compose file found in ${workspace}`);
  }

  core.info(
    `  Using fallback values: dockerfile=${defaultDockerfile}, context=${defaultContext}${target ? `, target=${target}` : ""}`,
  );
  return {
    dockerfile: defaultDockerfile,
    context: defaultContext,
    target: target || undefined,
  };
}

module.exports = resolveDockerContext;
