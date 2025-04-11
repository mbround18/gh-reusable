const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("fs");
const path = require("path");

async function run() {
  try {
    // Get inputs
    const image = core.getInput("image");
    const dockerfile = core.getInput("dockerfile");
    const context = core.getInput("context");
    const push = core.getInput("push") === "true";
    const buildArgs = core.getInput("build-args");
    const target = core.getInput("target");
    const platforms = core.getInput("platforms") || "linux/amd64";

    // Sanitize tags input - clean up any malformed tags
    let tags = image.split(",");
    tags = tags.map((tag) => {
      // Make sure there's only one colon in the tag (image:tag format)
      const parts = tag.split(":");
      if (parts.length > 2) {
        core.warning(`Found malformed tag: ${tag}, attempting to fix`);
        return `${parts[0]}:${parts[1]}`;
      }
      return tag;
    });

    // Filter out empty tags
    tags = tags.filter((tag) => tag.trim() !== "");

    // Deduplicate tags
    tags = [...new Set(tags)];

    core.info(`🏗️ Building Docker image`);
    core.info(`  Dockerfile: ${dockerfile}`);
    core.info(`  Context: ${context}`);
    core.info(`  Push: ${push}`);
    core.info(`  Target: ${target || "default"}`);
    core.info(`  Platforms: ${platforms}`);
    core.info(`  Tags: ${tags.join(", ")}`);

    // Build command
    const buildCmd = ["buildx", "build"];

    // Add build args
    if (buildArgs) {
      const args = buildArgs.split(" ");
      args.forEach((arg) => {
        buildCmd.push("--build-arg", arg);
      });
    }

    // Add environment build args
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith("BUILD_ARG_")) {
        const argName = key.replace("BUILD_ARG_", "");
        buildCmd.push("--build-arg", `${argName}=${process.env[key]}`);
      }
    });

    // Add cache config
    buildCmd.push("--cache-from", "type=gha");
    buildCmd.push("--cache-to", "type=gha,mode=max");

    // Add dockerfile and context
    buildCmd.push("--file", dockerfile);

    // Add target platform
    buildCmd.push("--platform", platforms);

    // Add provenance attestation
    buildCmd.push(
      "--attest",
      `type=provenance,mode=max,builder-id=${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`,
    );

    // Add tags
    tags.forEach((tag) => {
      buildCmd.push("--tag", tag);
    });

    // Add target if specified
    if (target) {
      buildCmd.push("--target", target);
    }

    // Add push flag
    if (push) {
      buildCmd.push("--push");
      core.info(`  Will push image`);
    } else {
      buildCmd.push("--load");
      core.info(`  Will load image to local Docker`);
    }

    // Add metadata
    const metadataFile = path.join(
      process.env.RUNNER_TEMP || "/tmp",
      "docker-metadata.json",
    );
    buildCmd.push("--metadata-file", metadataFile);

    // Add context
    buildCmd.push(context);

    // Execute build
    core.info(`🚀 Executing Docker build command:`);
    await exec.exec("docker", buildCmd);

    // Read and parse metadata
    if (fs.existsSync(metadataFile)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

        // Set outputs
        if (metadata.containerimage) {
          core.setOutput("image-id", metadata.containerimage.digest || "");
          core.info(
            `📝 Image ID: ${metadata.containerimage.digest || "unknown"}`,
          );
        }
      } catch (error) {
        core.warning(`Failed to parse metadata: ${error.message}`);
      }
    }

    core.info("✅ Docker build completed successfully");
  } catch (error) {
    core.setFailed(`Docker build failed: ${error.message}`);
  }
}

run();
