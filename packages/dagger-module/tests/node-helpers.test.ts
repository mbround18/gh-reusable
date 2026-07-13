import { describe, expect, test } from "vitest";

// ─── nodeInstallCommand / nodeBuildCommand / nodeTestCommand ──────────────────
// These return the exact argument arrays passed to `withExec` in the container.
// A wrong command crashes the entire pipeline step.

type NodePackageManager = "npm" | "pnpm" | "yarn";

function nodeInstallCommand(
  manager: NodePackageManager,
): readonly [string, ...string[]] {
  if (manager === "pnpm") return ["pnpm", "install", "--frozen-lockfile"];
  if (manager === "yarn") return ["sh", "-lc", "yarn install --frozen-lockfile"];
  return ["npm", "ci"];
}

function nodeBuildCommand(
  manager: NodePackageManager,
): readonly [string, ...string[]] {
  if (manager === "yarn") return ["yarn", "run", "build"];
  return [manager, "run", "build"];
}

function nodeTestCommand(
  manager: NodePackageManager,
): readonly [string, ...string[]] {
  if (manager === "yarn") return ["yarn", "test"];
  return [manager, "test"];
}

describe("nodeInstallCommand", () => {
  test("npm → npm ci", () => {
    expect(nodeInstallCommand("npm")).toEqual(["npm", "ci"]);
  });
  test("pnpm → pnpm install --frozen-lockfile", () => {
    expect(nodeInstallCommand("pnpm")).toEqual([
      "pnpm",
      "install",
      "--frozen-lockfile",
    ]);
  });
  test("yarn → shell invocation with yarn install --frozen-lockfile", () => {
    const cmd = nodeInstallCommand("yarn");
    expect(cmd[0]).toBe("sh");
    expect(cmd.join(" ")).toContain("yarn install --frozen-lockfile");
  });
  test("returns a non-empty tuple for all managers", () => {
    for (const manager of ["npm", "pnpm", "yarn"] as NodePackageManager[]) {
      const cmd = nodeInstallCommand(manager);
      expect(cmd.length).toBeGreaterThan(0);
      expect(typeof cmd[0]).toBe("string");
    }
  });
});

describe("nodeBuildCommand", () => {
  test("npm → npm run build", () => {
    expect(nodeBuildCommand("npm")).toEqual(["npm", "run", "build"]);
  });
  test("pnpm → pnpm run build", () => {
    expect(nodeBuildCommand("pnpm")).toEqual(["pnpm", "run", "build"]);
  });
  test("yarn → yarn run build", () => {
    expect(nodeBuildCommand("yarn")).toEqual(["yarn", "run", "build"]);
  });
});

describe("nodeTestCommand", () => {
  test("npm → npm test", () => {
    expect(nodeTestCommand("npm")).toEqual(["npm", "test"]);
  });
  test("pnpm → pnpm test", () => {
    expect(nodeTestCommand("pnpm")).toEqual(["pnpm", "test"]);
  });
  test("yarn → yarn test (not yarn run test)", () => {
    expect(nodeTestCommand("yarn")).toEqual(["yarn", "test"]);
  });
});

// ─── stripTag (docker-release-semver) ────────────────────────────────────────
// Strips :tag suffix from an image address while preserving registry:port URLs.
// Uses lastColon > lastSlash heuristic.

function stripTag(address: string): string {
  const digestSeparator = address.indexOf("@");
  const withoutDigest =
    digestSeparator >= 0 ? address.slice(0, digestSeparator) : address;
  const lastColon = withoutDigest.lastIndexOf(":");
  const lastSlash = withoutDigest.lastIndexOf("/");
  if (lastColon > lastSlash) {
    return withoutDigest.slice(0, lastColon);
  }
  return withoutDigest;
}

describe("stripTag", () => {
  test("strips :tag from a plain image", () => {
    expect(stripTag("nginx:latest")).toBe("nginx");
  });
  test("strips :tag from org/image address", () => {
    expect(stripTag("org/app:v1.2.3")).toBe("org/app");
  });
  test("strips :tag from full registry address", () => {
    expect(stripTag("ghcr.io/org/app:v1.0.0")).toBe("ghcr.io/org/app");
  });
  test("does NOT strip port from registry address without tag", () => {
    // registry.io:5000/image has colon BEFORE last slash — should not strip port
    expect(stripTag("registry.io:5000/image")).toBe("registry.io:5000/image");
  });
  test("strips tag from registry:port/image:tag", () => {
    expect(stripTag("registry.io:5000/image:v2.0.0")).toBe(
      "registry.io:5000/image",
    );
  });
  test("strips digest portion before processing tag", () => {
    expect(stripTag("org/app:v1.0.0@sha256:abc123")).toBe("org/app");
  });
  test("returns address unchanged when no tag", () => {
    expect(stripTag("org/app")).toBe("org/app");
  });
  test("returns address unchanged for localhost/image without tag", () => {
    expect(stripTag("localhost/image")).toBe("localhost/image");
  });
  test("handles image with only digest (no tag colon)", () => {
    expect(stripTag("org/app@sha256:abc")).toBe("org/app");
  });
});

// ─── dockerAuthKeys ───────────────────────────────────────────────────────────
// Returns candidate auth key strings for looking up credentials in
// ~/.docker/config.json.  Docker Hub has a special legacy key.

function dockerAuthKeys(registryAddress: string): readonly string[] {
  if (
    registryAddress === "docker.io" ||
    registryAddress === "index.docker.io"
  ) {
    return [
      "https://index.docker.io/v1/",
      "index.docker.io",
      "docker.io",
      "registry-1.docker.io",
    ];
  }
  return [registryAddress];
}

describe("dockerAuthKeys", () => {
  test("returns multiple legacy keys for docker.io", () => {
    const keys = dockerAuthKeys("docker.io");
    expect(keys).toContain("https://index.docker.io/v1/");
    expect(keys).toContain("docker.io");
    expect(keys.length).toBeGreaterThan(1);
  });
  test("returns multiple legacy keys for index.docker.io", () => {
    const keys = dockerAuthKeys("index.docker.io");
    expect(keys).toContain("https://index.docker.io/v1/");
    expect(keys.length).toBeGreaterThan(1);
  });
  test("returns single key for ghcr.io", () => {
    expect(dockerAuthKeys("ghcr.io")).toEqual(["ghcr.io"]);
  });
  test("returns single key for custom registry", () => {
    expect(dockerAuthKeys("registry.example.com")).toEqual([
      "registry.example.com",
    ]);
  });
  test("returns single key for localhost registry", () => {
    expect(dockerAuthKeys("localhost:5000")).toEqual(["localhost:5000"]);
  });
});
