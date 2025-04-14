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

  // Generate possible compose file paths to check
  const possiblePaths = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ]
    .reduce((acc, file) => {
      // If defaultContext is not '.', use it as a base directory to look for compose files
      if (defaultContext !== ".") {
        acc.push(path.join(workspace, defaultContext, file));
      }
      acc.push(path.join(workspace, file));
      return acc;
    }, [])
    .map((p) => path.normalize(p));

  // Find first existing compose file
  let composeFile = null;
  let composeDir = null;
  for (const filePath of possiblePaths) {
    const exists = composeExists(filePath);
    if (exists) {
      composeFile = exists;
      // Get the directory part of the compose file path
      // This is safer than using path.dirname if it might not be available
      composeDir = composeFile.substring(0, composeFile.lastIndexOf("/"));
      if (!composeDir) {
        composeDir = ".";
      }
      break;
    }
  }

  if (composeFile) {
    core.info(`  Found compose file: ${composeFile}`);

    try {
      // Pass target to parseCompose for matching in docker-compose
      const buildConfig = parseCompose(composeFile, image, target);

      if (buildConfig) {
        core.info(`  Using configuration from docker-compose for ${image}`);

        // Ensure context paths from compose file are relative to the compose file's directory
        let resolvedContext = buildConfig.context;
        if (resolvedContext && !path.isAbsolute(resolvedContext)) {
          // If the compose file is in a subdirectory, adjust the context path
          if (composeDir !== workspace) {
            // Manually join the paths
            let fullContextPath = `${composeDir}/${resolvedContext}`;
            // Clean up any double slashes
            fullContextPath = fullContextPath.replace(/\/\//g, "/");

            // Make it relative to workspace
            resolvedContext = fullContextPath;
            if (resolvedContext.startsWith(workspace)) {
              resolvedContext = resolvedContext.substring(workspace.length);
              if (resolvedContext.startsWith("/")) {
                resolvedContext = resolvedContext.substring(1);
              }
            }

            // Ensure paths are POSIX style for Docker
            resolvedContext = resolvedContext.replace(/\\/g, "/");
            // Add ./ prefix if needed
            if (
              !resolvedContext.startsWith("./") &&
              !resolvedContext.startsWith("/")
            ) {
              resolvedContext = `./${resolvedContext}`;
            }

            buildConfig.context = resolvedContext;
          }
        }

        core.info(
          `  Dockerfile: ${buildConfig.dockerfile}, Context: ${buildConfig.context}`,
        );

        // If input target was provided, it should override the docker-compose target
        if (target) {
          buildConfig.target = target;
          core.info(`  Target: ${target} (from input)`);
        } else if (buildConfig.target) {
          core.info(`  Target: ${buildConfig.target} (from docker-compose)`);
        }

        return buildConfig;
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
