"use strict";
const core = require("@actions/core");
const node_fs = require("node:fs");
const path = require("node:path");
const yaml = require("yaml");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const core__namespace = /* @__PURE__ */ _interopNamespaceDefault(core);
const COMPOSE_PATHS = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
function resolveDockerFacts(inputs, github) {
  const explicitTarget = inputs.target;
  let contextAbsolute = resolvePath(github.workspace, inputs.context);
  let dockerfileAbsolute = findDockerfile(github.workspace, inputs.dockerfile, inputs.context);
  let target = explicitTarget;
  let buildArgs = {};
  const composeFile = findDockerCompose(github.workspace, inputs.context);
  if (composeFile) {
    const composeData = parseDockerCompose(composeFile, inputs.image);
    if (composeData.dockerfile) {
      if (composeData.context) {
        const composeContext = path.join(inputs.context, composeData.context);
        contextAbsolute = resolvePath(github.workspace, composeContext);
        const composeDockerfile = path.join(composeContext, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(github.workspace, composeDockerfile, contextAbsolute);
      } else {
        const composeDockerfile = path.join(inputs.context, composeData.dockerfile);
        dockerfileAbsolute = findDockerfile(github.workspace, composeDockerfile, contextAbsolute);
      }
    } else if (composeData.context) {
      const composeContext = path.join(inputs.context, composeData.context);
      contextAbsolute = resolvePath(github.workspace, composeContext);
      dockerfileAbsolute = findDockerfile(github.workspace, inputs.dockerfile, contextAbsolute);
    }
    if (composeData.target && explicitTarget.length === 0) {
      target = composeData.target;
    }
    buildArgs = composeData.buildArgs;
  }
  return {
    context: resolvePath(github.workspace, contextAbsolute, true),
    dockerfile: resolvePath(github.workspace, dockerfileAbsolute, true),
    target,
    push: shouldPushImage({
      eventName: github.eventName,
      ref: github.ref,
      defaultBranch: github.defaultBranch,
      canaryLabel: inputs.canaryLabel,
      forcePush: inputs.forcePush,
      eventPath: github.eventPath
    }),
    tags: generateTags({
      image: inputs.image,
      version: inputs.version,
      registries: inputs.registries,
      withLatest: inputs.withLatest,
      ref: github.ref,
      target,
      prependTarget: inputs.prependTarget
    }),
    buildArgs
  };
}
function resolvePath(workspace, value, toRelative = false) {
  if (value.length === 0) {
    return "";
  }
  const normalizedWorkspace = path.resolve(workspace);
  if (toRelative) {
    const absoluteValue = path.resolve(value);
    if (absoluteValue.startsWith(normalizedWorkspace)) {
      const relativePath = path.relative(normalizedWorkspace, absoluteValue);
      return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
    }
    return value;
  }
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.normalize(path.join(normalizedWorkspace, value.replace(/^[./]+/, "")));
}
function findDockerfile(workspace, dockerfilePath, contextPath) {
  const absoluteDockerfile = resolvePath(workspace, dockerfilePath);
  const absoluteContext = resolvePath(workspace, contextPath);
  const possiblePaths = [
    absoluteDockerfile,
    path.join(absoluteContext, path.basename(dockerfilePath)),
    path.join(absoluteContext, dockerfilePath.replace(/^[./]+/, ""))
  ];
  for (const candidate of [...new Set(possiblePaths)]) {
    if (node_fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return absoluteDockerfile;
}
function findDockerCompose(workspace, contextPath) {
  const normalizedWorkspace = path.resolve(workspace);
  for (const composePath of COMPOSE_PATHS) {
    const candidate = path.join(normalizedWorkspace, composePath);
    if (node_fs.existsSync(candidate)) {
      return candidate;
    }
  }
  if (contextPath && contextPath !== "." && contextPath !== "./") {
    const absoluteContext = resolvePath(normalizedWorkspace, contextPath);
    if (absoluteContext !== normalizedWorkspace) {
      for (const composePath of COMPOSE_PATHS) {
        const candidate = path.join(absoluteContext, composePath);
        if (node_fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return void 0;
}
function parseDockerCompose(filePath, imageName) {
  const fallback = {
    dockerfile: null,
    context: null,
    buildArgs: {},
    target: null
  };
  try {
    const raw = node_fs.readFileSync(filePath, "utf8");
    const compose = yaml.parse(raw);
    if (!compose?.services) {
      return fallback;
    }
    for (const service of Object.values(compose.services)) {
      if (!serviceMatchesImage(service, imageName)) {
        continue;
      }
      const build = service.build;
      if (typeof build === "string") {
        return { ...fallback, context: build };
      }
      if (!isRecord(build)) {
        return fallback;
      }
      const buildRecord = build;
      return {
        dockerfile: typeof buildRecord.dockerfile === "string" ? buildRecord.dockerfile : null,
        context: typeof buildRecord.context === "string" ? buildRecord.context : null,
        target: typeof buildRecord.target === "string" ? buildRecord.target : null,
        buildArgs: parseBuildArgs(buildRecord.args)
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}
function shouldPushImage(input) {
  if (input.forcePush) {
    return true;
  }
  if (input.ref === `refs/heads/${input.defaultBranch}` || input.ref.startsWith("refs/tags/")) {
    return true;
  }
  if (input.eventName === "pull_request") {
    const labels = getPullRequestLabels(loadEventData(input.eventPath));
    return labels.includes(input.canaryLabel);
  }
  return false;
}
function generateTags(input) {
  const targetPrefix = input.prependTarget && input.target.length > 0 ? `${input.target}-` : "";
  const versionTag = input.version.startsWith("v") ? `${targetPrefix}${input.version}` : `${targetPrefix}v${input.version}`;
  const baseTags = [`${input.image}:${versionTag}`];
  if (input.withLatest && input.ref.startsWith("refs/tags/") && !isPreReleaseVersion(input.version)) {
    baseTags.push(`${input.image}:${targetPrefix}latest`);
  }
  const imageWithoutRegistry = stripRegistry(input.image);
  const output = [];
  for (const baseTag of baseTags) {
    output.push(baseTag);
    const [, tagValue = "latest"] = baseTag.split(":");
    for (const registry of input.registries.filter((value) => value.length > 0)) {
      output.push(`${registry}/${imageWithoutRegistry}:${tagValue}`);
    }
  }
  return output;
}
function parseBuildArgs(args) {
  if (isRecord(args)) {
    return Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== void 0).map(([key, value]) => [key, String(value)])
    );
  }
  if (Array.isArray(args)) {
    return Object.fromEntries(
      args.filter((value) => typeof value === "string" && value.includes("=")).map((pair) => {
        const [name, ...rest] = pair.split("=");
        return [name, rest.join("=")];
      })
    );
  }
  return {};
}
function serviceMatchesImage(service, imageName) {
  return typeof service.image === "string" && service.image.startsWith(`${imageName}:`);
}
function loadEventData(eventPath) {
  if (!eventPath || !node_fs.existsSync(eventPath)) {
    return {};
  }
  try {
    return JSON.parse(node_fs.readFileSync(eventPath, "utf8"));
  } catch {
    return {};
  }
}
function getPullRequestLabels(eventData) {
  if (!isRecord(eventData) || !isRecord(eventData.pull_request) || !Array.isArray(eventData.pull_request.labels)) {
    return [];
  }
  return eventData.pull_request.labels.filter((label) => isRecord(label) && typeof label.name === "string").map((label) => label.name);
}
function stripRegistry(image) {
  if (!image.includes("/")) {
    return image;
  }
  const parts = image.split("/");
  const first = parts[0] ?? "";
  if (first.includes(".") || first === "localhost" || first === "ghcr" || first === "docker") {
    return parts.slice(1).join("/");
  }
  return image;
}
function isPreReleaseVersion(version) {
  return ["alpha", "beta", "rc", "dev"].some((token) => version.includes(token));
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function getRequiredInput(name) {
  return core__namespace.getInput(name, { required: true });
}
function getBooleanInput(name, defaultValue = false) {
  const value = core__namespace.getInput(name);
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}
function getStringInput(name, defaultValue = "") {
  return core__namespace.getInput(name) || defaultValue;
}
function parseRegistries(value) {
  return value.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
}
function exportBuildArgs(buildArgs) {
  for (const [name, value] of Object.entries(buildArgs)) {
    process.env[`BUILD_ARG_${name.toUpperCase()}`] = value;
  }
}
async function run() {
  try {
    const result = resolveDockerFacts(
      {
        image: getRequiredInput("image"),
        version: getRequiredInput("version"),
        registries: parseRegistries(getStringInput("registries")),
        dockerfile: getStringInput("dockerfile", "./Dockerfile"),
        context: getStringInput("context", "."),
        canaryLabel: getStringInput("canary_label", "canary"),
        forcePush: getBooleanInput("force_push"),
        withLatest: getBooleanInput("with_latest"),
        target: getStringInput("target"),
        prependTarget: getBooleanInput("prepend_target")
      },
      {
        workspace: process.env.GITHUB_WORKSPACE || ".",
        eventName: process.env.GITHUB_EVENT_NAME || "",
        ref: process.env.GITHUB_REF || "",
        defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || "main",
        eventPath: process.env.GITHUB_EVENT_PATH
      }
    );
    exportBuildArgs(result.buildArgs);
    core__namespace.setOutput("dockerfile", result.dockerfile);
    core__namespace.setOutput("context", result.context);
    core__namespace.setOutput("target", result.target);
    core__namespace.setOutput("push", result.push ? "true" : "false");
    core__namespace.setOutput("tags", result.tags.join(","));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core__namespace.setFailed(message);
  }
}
void run();
//# sourceMappingURL=index.js.map
