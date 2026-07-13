import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";

// ─── parseDockerBuildArgs ─────────────────────────────────────────────────────
// Handles both object format ({ KEY: "val" }) and array format (["KEY=val"]).

function parseDockerBuildArgs(args: unknown): Record<string, string> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return Object.fromEntries(
      Object.entries(args as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
  }
  if (Array.isArray(args)) {
    return Object.fromEntries(
      (args as unknown[])
        .filter((v): v is string => typeof v === "string" && v.includes("="))
        .map((pair) => {
          const [name, ...rest] = pair.split("=");
          return [name, rest.join("=")];
        }),
    );
  }
  return {};
}

describe("parseDockerBuildArgs — object format", () => {
  test("converts object keys to string values", () => {
    expect(parseDockerBuildArgs({ NODE_ENV: "production" })).toEqual({
      NODE_ENV: "production",
    });
  });
  test("converts numeric values to strings", () => {
    expect(parseDockerBuildArgs({ PORT: 8080 })).toEqual({ PORT: "8080" });
  });
  test("filters out undefined values", () => {
    expect(parseDockerBuildArgs({ A: "1", B: undefined })).toEqual({ A: "1" });
  });
  test("returns empty object for empty object input", () => {
    expect(parseDockerBuildArgs({})).toEqual({});
  });
  test("handles boolean values", () => {
    expect(parseDockerBuildArgs({ ENABLE_FEATURE: true })).toEqual({
      ENABLE_FEATURE: "true",
    });
  });
});

describe("parseDockerBuildArgs — array format", () => {
  test("parses KEY=value pairs", () => {
    expect(parseDockerBuildArgs(["NODE_ENV=production", "PORT=3000"])).toEqual({
      NODE_ENV: "production",
      PORT: "3000",
    });
  });
  test("handles value with embedded = sign", () => {
    expect(parseDockerBuildArgs(["DATABASE_URL=postgres://user:pass@host/db"])).toEqual({
      DATABASE_URL: "postgres://user:pass@host/db",
    });
  });
  test("skips entries without = sign", () => {
    expect(parseDockerBuildArgs(["INVALID", "KEY=value"])).toEqual({
      KEY: "value",
    });
  });
  test("returns empty object for empty array", () => {
    expect(parseDockerBuildArgs([])).toEqual({});
  });
  test("skips non-string array entries", () => {
    expect(parseDockerBuildArgs([42, "KEY=value"])).toEqual({ KEY: "value" });
  });
});

describe("parseDockerBuildArgs — edge cases", () => {
  test("returns empty object for null", () => {
    expect(parseDockerBuildArgs(null)).toEqual({});
  });
  test("returns empty object for undefined", () => {
    expect(parseDockerBuildArgs(undefined)).toEqual({});
  });
  test("returns empty object for string (not object or array)", () => {
    expect(parseDockerBuildArgs("KEY=value")).toEqual({});
  });
});

// ─── parseDockerComposeYaml ───────────────────────────────────────────────────

interface DockerComposeBuild {
  dockerfile: string | null;
  context: string | null;
  target: string | null;
  buildArgs: Record<string, string>;
}

function parseDockerComposeYaml(raw: string, imageName: string): DockerComposeBuild {
  const fallback: DockerComposeBuild = {
    dockerfile: null,
    context: null,
    target: null,
    buildArgs: {},
  };
  try {
    const compose = parseYaml(raw) as {
      services?: Record<string, { image?: unknown; build?: unknown }>;
    } | null;
    if (!compose?.services) return fallback;
    for (const service of Object.values(compose.services)) {
      if (
        typeof service.image !== "string" ||
        !service.image.startsWith(`${imageName}:`)
      )
        continue;
      const build = service.build;
      if (typeof build === "string") return { ...fallback, context: build };
      if (typeof build !== "object" || !build) return fallback;
      const b = build as Record<string, unknown>;
      return {
        dockerfile: typeof b["dockerfile"] === "string" ? b["dockerfile"] : null,
        context: typeof b["context"] === "string" ? b["context"] : null,
        target: typeof b["target"] === "string" ? b["target"] : null,
        buildArgs: parseDockerBuildArgs(b["args"]),
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

describe("parseDockerComposeYaml", () => {
  test("extracts object-style build config from matching service", () => {
    const yaml = `
services:
  app:
    image: myapp:latest
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      target: release
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBe("./app");
    expect(result.dockerfile).toBe("Dockerfile.prod");
    expect(result.target).toBe("release");
  });

  test("handles string-style build (context only)", () => {
    const yaml = `
services:
  app:
    image: myapp:latest
    build: ./app
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBe("./app");
    expect(result.dockerfile).toBeNull();
  });

  test("returns fallback when no service matches imageName", () => {
    const yaml = `
services:
  other:
    image: otherapp:latest
    build:
      context: ./other
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBeNull();
    expect(result.dockerfile).toBeNull();
  });

  test("returns fallback for invalid YAML", () => {
    const result = parseDockerComposeYaml("{ invalid: yaml: [", "myapp");
    expect(result.context).toBeNull();
    expect(result.buildArgs).toEqual({});
  });

  test("returns fallback for empty YAML", () => {
    const result = parseDockerComposeYaml("", "myapp");
    expect(result).toEqual({
      dockerfile: null,
      context: null,
      target: null,
      buildArgs: {},
    });
  });

  test("returns fallback when build section is absent", () => {
    const yaml = `
services:
  app:
    image: myapp:latest
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBeNull();
  });

  test("extracts build args from object-style build", () => {
    const yaml = `
services:
  app:
    image: myapp:latest
    build:
      context: .
      args:
        NODE_ENV: production
        PORT: "3000"
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.buildArgs).toEqual({ NODE_ENV: "production", PORT: "3000" });
  });

  test("matches service using imageName:tag prefix check", () => {
    // Service image must start with imageName + ':'
    const yaml = `
services:
  app:
    image: myapp:v1.0.0
    build:
      context: ./src
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBe("./src");
  });

  test("does not match service whose image starts with a longer prefix", () => {
    const yaml = `
services:
  app:
    image: myapp-extra:latest
    build:
      context: ./src
`;
    const result = parseDockerComposeYaml(yaml, "myapp");
    expect(result.context).toBeNull();
  });
});

// ─── renderCodeMatrixMarkdown ─────────────────────────────────────────────────

function renderCodeMatrixMarkdown(r: {
  languages: string[];
  packageManagers: string[];
  nodePackageManager: string;
  hasDocker: boolean;
  hasHelm: boolean;
  hasCompose: boolean;
  isMonorepo: boolean;
  manifests: string[];
  lockfiles: string[];
  publishTargets: string[];
}): string {
  const bool = (v: boolean) => (v ? "✅" : "❌");
  const list = (arr: string[]) =>
    arr.length > 0 ? arr.map((s) => `\`${s}\``).join(", ") : "_(none)_";
  return [
    "### Code Matrix",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Languages | ${list(r.languages)} |`,
    `| Package managers | ${list(r.packageManagers)} |`,
    `| Node package manager | ${r.nodePackageManager ? `\`${r.nodePackageManager}\`` : "_(none)_"} |`,
    `| Publish targets | ${list(r.publishTargets)} |`,
    `| Manifests | ${list(r.manifests)} |`,
    `| Lockfiles | ${list(r.lockfiles)} |`,
    `| Docker | ${bool(r.hasDocker)} |`,
    `| Helm | ${bool(r.hasHelm)} |`,
    `| Docker Compose | ${bool(r.hasCompose)} |`,
    `| Monorepo | ${bool(r.isMonorepo)} |`,
  ].join("\n");
}

const baseMatrix = {
  languages: [],
  packageManagers: [],
  nodePackageManager: "",
  hasDocker: false,
  hasHelm: false,
  hasCompose: false,
  isMonorepo: false,
  manifests: [],
  lockfiles: [],
  publishTargets: [],
};

describe("renderCodeMatrixMarkdown", () => {
  test("produces a markdown table header", () => {
    const md = renderCodeMatrixMarkdown(baseMatrix);
    expect(md).toContain("### Code Matrix");
    expect(md).toContain("| Field | Value |");
    expect(md).toContain("| --- | --- |");
  });

  test("shows languages when present", () => {
    const md = renderCodeMatrixMarkdown({
      ...baseMatrix,
      languages: ["typescript", "rust"],
    });
    expect(md).toContain("`typescript`");
    expect(md).toContain("`rust`");
  });

  test("shows (none) for empty languages", () => {
    const md = renderCodeMatrixMarkdown(baseMatrix);
    expect(md).toContain("_(none)_");
  });

  test("renders Docker as ✅ when true", () => {
    const md = renderCodeMatrixMarkdown({ ...baseMatrix, hasDocker: true });
    expect(md).toMatch(/Docker.*✅/);
  });

  test("renders Docker as ❌ when false", () => {
    const md = renderCodeMatrixMarkdown({ ...baseMatrix, hasDocker: false });
    expect(md).toMatch(/Docker.*❌/);
  });

  test("renders monorepo flag correctly", () => {
    const md = renderCodeMatrixMarkdown({ ...baseMatrix, isMonorepo: true });
    expect(md).toMatch(/Monorepo.*✅/);
  });

  test("shows node package manager when set", () => {
    const md = renderCodeMatrixMarkdown({
      ...baseMatrix,
      nodePackageManager: "pnpm",
    });
    expect(md).toContain("`pnpm`");
  });

  test("shows (none) for empty node package manager", () => {
    const md = renderCodeMatrixMarkdown({
      ...baseMatrix,
      nodePackageManager: "",
    });
    expect(md).toContain("_(none)_");
  });

  test("lists all manifests", () => {
    const md = renderCodeMatrixMarkdown({
      ...baseMatrix,
      manifests: ["package.json", "Cargo.toml"],
    });
    expect(md).toContain("`package.json`");
    expect(md).toContain("`Cargo.toml`");
  });

  test("lists publish targets", () => {
    const md = renderCodeMatrixMarkdown({
      ...baseMatrix,
      publishTargets: ["pnpm", "rust-crate"],
    });
    expect(md).toContain("`rust-crate`");
  });

  test("full realistic Rust+TypeScript workspace produces expected rows", () => {
    const md = renderCodeMatrixMarkdown({
      languages: ["typescript", "rust"],
      packageManagers: ["pnpm", "cargo"],
      nodePackageManager: "pnpm",
      hasDocker: true,
      hasHelm: false,
      hasCompose: true,
      isMonorepo: true,
      manifests: ["package.json", "Cargo.toml"],
      lockfiles: ["pnpm-lock.yaml", "Cargo.lock"],
      publishTargets: ["pnpm", "rust-crate"],
    });
    expect(md).toContain("`typescript`");
    expect(md).toContain("`pnpm`");
    expect(md).toContain("`cargo`");
    expect(md).toMatch(/Docker.*✅/);
    expect(md).toMatch(/Helm.*❌/);
    expect(md).toMatch(/Monorepo.*✅/);
  });
});
