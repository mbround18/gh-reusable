// Helper functions for testing docker-build action logic
// These are pure functions extracted from index.js for unit testing

function splitTags(imageString) {
  return imageString
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

function fixMalformedTag(tag) {
  const parts = tag.split(":");
  if (parts.length > 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return tag;
}

function deduplicateTags(tags) {
  return Array.from(new Set(tags));
}

function parseBuildArgs(buildArgsString) {
  if (!buildArgsString) return [];
  return buildArgsString.split(" ").filter((arg) => arg.trim() !== "");
}

function extractBuildArgEnvVars(env = process.env) {
  const args = [];
  Object.keys(env).forEach((key) => {
    if (key.startsWith("BUILD_ARG_")) {
      const argName = key.replace("BUILD_ARG_", "");
      args.push(`${argName}=${env[key]}`);
    }
  });
  return args;
}

function combineBuildArgs(inputArgs, env = process.env) {
  const parsed = parseBuildArgs(inputArgs);
  const envArgs = extractBuildArgEnvVars(env);
  return [...parsed, ...envArgs];
}

function buildDockerCommand({
  tags,
  dockerfile,
  context,
  platforms,
  push,
  target,
  buildArgs,
  metadataFile,
  provenanceUrl,
}) {
  const cmd = ["buildx", "build"];

  // Add build args
  buildArgs.forEach((arg) => {
    cmd.push("--build-arg", arg);
  });

  // Cache configuration
  cmd.push("--cache-from", "type=gha");
  cmd.push("--cache-to", "type=gha,mode=max");

  // Dockerfile and platform
  cmd.push("--file", dockerfile);
  cmd.push("--platform", platforms);

  // Provenance attestation
  cmd.push("--attest", `type=provenance,mode=max,builder-id=${provenanceUrl}`);

  // Tags
  tags.forEach((tag) => {
    cmd.push("--tag", tag);
  });

  // Target (optional)
  if (target) {
    cmd.push("--target", target);
  }

  // Push or load
  if (push) {
    cmd.push("--push");
  } else {
    cmd.push("--load");
  }

  // Metadata file
  cmd.push("--metadata-file", metadataFile);

  // Context (must be last)
  cmd.push(context);

  return cmd;
}

module.exports = {
  splitTags,
  fixMalformedTag,
  deduplicateTags,
  parseBuildArgs,
  extractBuildArgEnvVars,
  combineBuildArgs,
  buildDockerCommand,
};
