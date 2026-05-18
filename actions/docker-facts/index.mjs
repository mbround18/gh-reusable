import { existsSync, readFileSync, appendFileSync } from "node:fs";
import {
  join,
  resolve,
  relative,
  normalize,
  isAbsolute,
  basename,
  dirname,
} from "node:path";
import { execSync } from "node:child_process";

const getInput = (n) =>
  (process.env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
const setOutput = (n, v) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${n}=${v}\n`);
const setFailed = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const info = (msg) => console.log(msg);

const COMPOSE_PATHS = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

function parseYaml(filePath) {
  try {
    const out = execSync(
      `python3 -c "import yaml,sys,json; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))" "${filePath}"`,
      { encoding: "utf8" },
    );
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function resolvePath(workspace, value, toRelative = false) {
  if (!value) return "";
  const normWs = resolve(workspace);
  if (toRelative) {
    const abs = resolve(value);
    if (abs.startsWith(normWs)) {
      const rel = relative(normWs, abs);
      return rel.startsWith(".") ? rel : `./${rel}`;
    }
    return value;
  }
  if (isAbsolute(value)) return normalize(value);
  return normalize(join(normWs, value.replace(/^[./]+/, "")));
}

function findDockerfile(workspace, dockerfilePath, contextPath) {
  const absDockerfile = resolvePath(workspace, dockerfilePath);
  const absContext = resolvePath(workspace, contextPath);
  const candidates = [
    ...new Set([
      absDockerfile,
      join(absContext, basename(dockerfilePath)),
      join(absContext, dockerfilePath.replace(/^[./]+/, "")),
    ]),
  ];
  return candidates.find((p) => existsSync(p)) ?? absDockerfile;
}

function findDockerCompose(workspace, contextPath) {
  const normWs = resolve(workspace);
  for (const f of COMPOSE_PATHS) {
    const c = join(normWs, f);
    if (existsSync(c)) return c;
  }
  if (contextPath && contextPath !== "." && contextPath !== "./") {
    const absCtx = resolvePath(normWs, contextPath);
    if (absCtx !== normWs) {
      for (const f of COMPOSE_PATHS) {
        const c = join(absCtx, f);
        if (existsSync(c)) return c;
      }
    }
  }
  return null;
}

function parseBuildArgs(args) {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return Object.fromEntries(
      Object.entries(args)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)]),
    );
  }
  if (Array.isArray(args)) {
    return Object.fromEntries(
      args
        .filter((v) => typeof v === "string" && v.includes("="))
        .map((pair) => {
          const [name, ...rest] = pair.split("=");
          return [name, rest.join("=")];
        }),
    );
  }
  return {};
}

function parseDockerCompose(filePath, imageName) {
  const compose = parseYaml(filePath);
  if (!compose?.services)
    return { dockerfile: null, context: null, buildArgs: {}, target: null };
  for (const service of Object.values(compose.services)) {
    if (
      typeof service.image !== "string" ||
      !service.image.startsWith(`${imageName}:`)
    )
      continue;
    const build = service.build;
    if (typeof build === "string")
      return { dockerfile: null, context: build, buildArgs: {}, target: null };
    if (!build || typeof build !== "object") continue;
    return {
      dockerfile:
        typeof build.dockerfile === "string" ? build.dockerfile : null,
      context: typeof build.context === "string" ? build.context : null,
      target: typeof build.target === "string" ? build.target : null,
      buildArgs: parseBuildArgs(build.args),
    };
  }
  return { dockerfile: null, context: null, buildArgs: {}, target: null };
}

function shouldPush({
  eventName,
  ref,
  defaultBranch,
  canaryLabel,
  forcePush,
  eventPath,
}) {
  if (forcePush) return true;
  if (ref === `refs/heads/${defaultBranch}` || ref.startsWith("refs/tags/"))
    return true;
  if (eventName === "pull_request") {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf8"));
      const labels = (event?.pull_request?.labels ?? [])
        .map((l) => l?.name)
        .filter(Boolean);
      return labels.includes(canaryLabel);
    } catch {
      return false;
    }
  }
  return false;
}

function stripRegistry(image) {
  if (!image.includes("/")) return image;
  const parts = image.split("/");
  const first = parts[0] ?? "";
  if (
    first.includes(".") ||
    first === "localhost" ||
    first === "ghcr" ||
    first === "docker"
  ) {
    return parts.slice(1).join("/");
  }
  return image;
}

function isPreRelease(version) {
  return ["alpha", "beta", "rc", "dev"].some((t) => version.includes(t));
}

function generateTags({
  image,
  version,
  registries,
  withLatest,
  ref,
  target,
  prependTarget,
}) {
  const prefix = prependTarget && target ? `${target}-` : "";
  const vTag = version.startsWith("v")
    ? `${prefix}${version}`
    : `${prefix}v${version}`;
  const baseTags = [`${image}:${vTag}`];
  if (withLatest && ref.startsWith("refs/tags/") && !isPreRelease(version)) {
    baseTags.push(`${image}:${prefix}latest`);
  }
  const imageNoReg = stripRegistry(image);
  const out = [];
  for (const baseTag of baseTags) {
    out.push(baseTag);
    const [, tagVal = "latest"] = baseTag.split(":");
    for (const reg of registries.filter(Boolean)) {
      out.push(`${reg}/${imageNoReg}:${tagVal}`);
    }
  }
  return out;
}

try {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const image = getInput("image");
  if (!image) throw new Error('Input "image" is required.');
  const version = getInput("version");
  if (!version) throw new Error('Input "version" is required.');
  const registries = getInput("registries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dockerfileInput = getInput("dockerfile") || "./Dockerfile";
  const contextInput = getInput("context") || ".";
  const canaryLabel = getInput("canary_label") || "canary";
  const forcePush = getInput("force_push") === "true";
  const withLatest = getInput("with_latest") === "true";
  const targetInput = getInput("target") || "";
  const prependTarget = getInput("prepend_target") === "true";

  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const ref = process.env.GITHUB_REF ?? "";
  const defaultBranch =
    process.env.GITHUB_BASE_REF ?? process.env.GITHUB_DEFAULT_BRANCH ?? "main";
  const eventPath = process.env.GITHUB_EVENT_PATH ?? "";

  let ctx = resolvePath(workspace, contextInput);
  let dockerfile = findDockerfile(workspace, dockerfileInput, contextInput);
  let target = targetInput;
  let buildArgs = {};

  const composeFile = findDockerCompose(workspace, contextInput);
  if (composeFile) {
    const compose = parseDockerCompose(composeFile, image);
    if (compose.dockerfile) {
      const composeCtxRel = compose.context
        ? join(contextInput, compose.context)
        : null;
      if (composeCtxRel) {
        ctx = resolvePath(workspace, composeCtxRel);
        dockerfile = findDockerfile(
          workspace,
          join(composeCtxRel, compose.dockerfile),
          ctx,
        );
      } else {
        dockerfile = findDockerfile(
          workspace,
          join(contextInput, compose.dockerfile),
          ctx,
        );
      }
    } else if (compose.context) {
      ctx = resolvePath(workspace, join(contextInput, compose.context));
      dockerfile = findDockerfile(workspace, dockerfileInput, ctx);
    }
    if (compose.target && !targetInput) target = compose.target;
    buildArgs = compose.buildArgs;
  }

  const push = shouldPush({
    eventName,
    ref,
    defaultBranch,
    canaryLabel,
    forcePush,
    eventPath,
  });
  const tags = generateTags({
    image,
    version,
    registries,
    withLatest,
    ref,
    target,
    prependTarget,
  });

  const ctxRel = resolvePath(workspace, ctx, true);
  const dockerfileRel = resolvePath(workspace, dockerfile, true);

  info(`context: ${ctxRel}`);
  info(`dockerfile: ${dockerfileRel}`);
  info(`target: ${target}`);
  info(`push: ${push}`);
  info(`tags: ${tags.join(",")}`);

  setOutput("context", ctxRel);
  setOutput("dockerfile", dockerfileRel);
  setOutput("target", target);
  setOutput("push", String(push));
  setOutput("tags", tags.join(","));
} catch (err) {
  setFailed(err instanceof Error ? err.message : String(err));
}
