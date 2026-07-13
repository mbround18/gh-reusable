import { describe, expect, test } from "vitest";

// ─── Pure-logic mirrors ───────────────────────────────────────────────────────
// These functions mirror the private helper methods added to the GhReusable
// Dagger module for crate publishing.  Testing them standalone avoids
// spinning up a Dagger engine while still exercising the logic at high coverage.

// ─── normalizeVersion ────────────────────────────────────────────────────────

/**
 * Strip a leading `v` prefix and validate the result looks like semver
 * (three dot-separated numbers at the start).  Returns `""` for non-version
 * strings such as branch names so the manifest version is used as fallback.
 */
function normalizeVersion(version: string): string {
  const stripped = version.startsWith("v") ? version.slice(1) : version;
  return /^[0-9]+\.[0-9]+\.[0-9]/.test(stripped) ? stripped : "";
}

describe("normalizeVersion", () => {
  test("strips v prefix from tag", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
  });
  test("strips v prefix from pre-release tag", () => {
    expect(normalizeVersion("v1.2.3-alpha.1")).toBe("1.2.3-alpha.1");
  });
  test("strips v prefix from build-metadata tag", () => {
    expect(normalizeVersion("v1.2.3+build.1")).toBe("1.2.3+build.1");
  });
  test("strips v prefix from 0.x tag", () => {
    expect(normalizeVersion("v0.0.1")).toBe("0.0.1");
  });
  test("keeps plain semver unchanged", () => {
    expect(normalizeVersion("1.2.3")).toBe("1.2.3");
  });
  test("keeps 10.20.30 unchanged", () => {
    expect(normalizeVersion("10.20.30")).toBe("10.20.30");
  });
  test("rejects branch name 'main'", () => {
    expect(normalizeVersion("main")).toBe("");
  });
  test("rejects branch name 'release/1.0'", () => {
    expect(normalizeVersion("release/1.0")).toBe("");
  });
  test("rejects two-part version", () => {
    expect(normalizeVersion("1.2")).toBe("");
  });
  test("rejects two-part version with v prefix", () => {
    expect(normalizeVersion("v1.2")).toBe("");
  });
  test("rejects single-number version", () => {
    expect(normalizeVersion("v1")).toBe("");
  });
  test("rejects empty string", () => {
    expect(normalizeVersion("")).toBe("");
  });
  test("rejects arbitrary sha-like string", () => {
    expect(normalizeVersion("abc123def")).toBe("");
  });
  test("rejects feature branch with numbers", () => {
    expect(normalizeVersion("feat/JIRA-123")).toBe("");
  });
});

// ─── isCargoWorkspace ────────────────────────────────────────────────────────

function isCargoWorkspace(raw: string): boolean {
  return /^\[workspace\]/m.test(raw);
}

describe("isCargoWorkspace", () => {
  test("detects [workspace] section", () => {
    const toml = `[workspace]\nmembers = ["crates/foo"]\n`;
    expect(isCargoWorkspace(toml)).toBe(true);
  });
  test("detects workspace+package in same file", () => {
    const toml = `[workspace]\nmembers = ["."]\n\n[package]\nname = "root"\nversion = "1.0.0"\n`;
    expect(isCargoWorkspace(toml)).toBe(true);
  });
  test("returns false for plain package manifest", () => {
    const toml = `[package]\nname = "foo"\nversion = "0.1.0"\n`;
    expect(isCargoWorkspace(toml)).toBe(false);
  });
  test("returns false for empty string", () => {
    expect(isCargoWorkspace("")).toBe(false);
  });
  test("does not match [workspace.package] as a workspace root", () => {
    // [workspace.package] can appear in non-root crates; the root marker is [workspace]
    const toml = `[package]\nname = "foo"\nversion = "1.0.0"\n\n[workspace.package]\nversion = "1.0.0"\n`;
    // This IS in a root workspace Cargo.toml, but the standalone [workspace] section
    // is what isCargoWorkspace checks for.
    expect(isCargoWorkspace(toml)).toBe(false);
  });
  test("returns true when [workspace] is not at line start (edge case — should not happen in valid TOML but regex is lenient)", () => {
    const toml = `\n[workspace]\nmembers = []\n`;
    expect(isCargoWorkspace(toml)).toBe(true);
  });
});

// ─── parseCargoWorkspaceMemberPaths ──────────────────────────────────────────

function parseCargoWorkspaceMemberPaths(raw: string): string[] {
  const sections = raw.split(/(?=^\[)/m);
  const workspaceSection = sections.find((s) => /^\[workspace\]/.test(s));
  if (!workspaceSection) return [];
  const membersMatch = workspaceSection.match(/^members\s*=\s*\[([\s\S]*?)\]/m);
  if (!membersMatch) return [];
  return membersMatch[1]
    .split(",")
    .map((m) => m.replace(/#[^\n]*/g, "").replace(/["']/g, "").trim())
    .filter(Boolean);
}

describe("parseCargoWorkspaceMemberPaths", () => {
  test("parses single member", () => {
    const toml = `[workspace]\nmembers = ["crates/foo"]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual(["crates/foo"]);
  });
  test("parses multiple members on one line", () => {
    const toml = `[workspace]\nmembers = ["crates/foo", "crates/bar", "crates/baz"]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([
      "crates/foo",
      "crates/bar",
      "crates/baz",
    ]);
  });
  test("parses multi-line members array", () => {
    const toml = `[workspace]\nmembers = [\n  "crates/foo",\n  "crates/bar",\n]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([
      "crates/foo",
      "crates/bar",
    ]);
  });
  test("strips inline comments from member lines", () => {
    const toml = `[workspace]\nmembers = [\n  "crates/foo", # main lib\n  "crates/bar",\n]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([
      "crates/foo",
      "crates/bar",
    ]);
  });
  test("handles members with single-quote strings", () => {
    const toml = `[workspace]\nmembers = ['crates/foo', 'crates/bar']\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([
      "crates/foo",
      "crates/bar",
    ]);
  });
  test("returns empty array when workspace has no members key", () => {
    const toml = `[workspace]\nexclude = ["examples"]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([]);
  });
  test("returns empty array for non-workspace manifest", () => {
    const toml = `[package]\nname = "foo"\nversion = "1.0.0"\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual([]);
  });
  test("returns empty array for empty string", () => {
    expect(parseCargoWorkspaceMemberPaths("")).toEqual([]);
  });
  test("does not include member paths from [package] section after [workspace]", () => {
    const toml = `[workspace]\nmembers = ["crates/foo"]\n\n[package]\nname = "root"\nversion = "1.0.0"\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual(["crates/foo"]);
  });
  test("handles glob patterns in members", () => {
    const toml = `[workspace]\nmembers = ["crates/*"]\n`;
    expect(parseCargoWorkspaceMemberPaths(toml)).toEqual(["crates/*"]);
  });
});

// ─── tryParseCargoManifest ────────────────────────────────────────────────────

function tomlPackageSection(raw: string): string {
  const sections = raw.split(/(?=^\[)/m);
  const pkg = sections.find((s) => /^\[package\]/.test(s));
  if (!pkg) throw new Error("Cargo.toml must contain a [package] section");
  return pkg;
}

function tomlField(section: string, key: string): string {
  const match = section.match(
    new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"),
  );
  if (!match?.[1]) throw new Error(`Cargo.toml must define package.${key}`);
  return match[1];
}

function parseCargoManifest(raw: string): { name: string; version: string } {
  const section = tomlPackageSection(raw);
  return { name: tomlField(section, "name"), version: tomlField(section, "version") };
}

function tryParseCargoManifest(raw: string): { name: string; version: string } | null {
  try { return parseCargoManifest(raw); } catch { return null; }
}

describe("tryParseCargoManifest", () => {
  test("parses name and version from valid [package] section", () => {
    const toml = `[package]\nname = "my-crate"\nversion = "1.2.3"\n`;
    expect(tryParseCargoManifest(toml)).toEqual({ name: "my-crate", version: "1.2.3" });
  });
  test("returns null for workspace-only root with no [package]", () => {
    const toml = `[workspace]\nmembers = ["crates/foo"]\n`;
    expect(tryParseCargoManifest(toml)).toBeNull();
  });
  test("returns null for empty string", () => {
    expect(tryParseCargoManifest("")).toBeNull();
  });
  test("ignores fields after package section end", () => {
    const toml = `[package]\nname = "foo"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n`;
    expect(tryParseCargoManifest(toml)).toEqual({ name: "foo", version: "0.1.0" });
  });
  test("returns null when version is missing", () => {
    const toml = `[package]\nname = "foo"\n`;
    expect(tryParseCargoManifest(toml)).toBeNull();
  });
  test("returns null when name is missing", () => {
    const toml = `[package]\nversion = "1.0.0"\n`;
    expect(tryParseCargoManifest(toml)).toBeNull();
  });
  test("parses crate with workspace-level package section", () => {
    const toml = `[workspace]\nmembers = ["."]\n\n[package]\nname = "root"\nversion = "2.0.0"\n`;
    expect(tryParseCargoManifest(toml)).toEqual({ name: "root", version: "2.0.0" });
  });
  test("parses pre-release version", () => {
    const toml = `[package]\nname = "beta-crate"\nversion = "1.0.0-beta.3"\n`;
    expect(tryParseCargoManifest(toml)).toEqual({ name: "beta-crate", version: "1.0.0-beta.3" });
  });
});

// ─── Publish command building ─────────────────────────────────────────────────

function buildPublishCommands(
  cratesToPublish: string[],
  registry: string,
): string[] {
  const registryFlag = registry !== "crates.io" ? ` --registry ${registry}` : "";
  if (cratesToPublish.length === 0) {
    return [`cargo publish --token "$CARGO_REGISTRY_TOKEN"${registryFlag}`];
  }
  return cratesToPublish.map(
    (c, i) =>
      `${i > 0 ? "sleep 5 && " : ""}cargo publish -p ${c} --token "$CARGO_REGISTRY_TOKEN"${registryFlag}`,
  );
}

describe("buildPublishCommands", () => {
  test("root crate (no -p flag) on crates.io", () => {
    const cmds = buildPublishCommands([], "crates.io");
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain("cargo publish --token");
    expect(cmds[0]).not.toContain("-p ");
    expect(cmds[0]).not.toContain("--registry");
  });
  test("single named crate uses -p flag", () => {
    const cmds = buildPublishCommands(["my-lib"], "crates.io");
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain("-p my-lib");
    expect(cmds[0]).not.toContain("sleep");
  });
  test("two workspace crates inserts sleep between them", () => {
    const cmds = buildPublishCommands(["foo", "bar"], "crates.io");
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).not.toContain("sleep");
    expect(cmds[1]).toMatch(/^sleep 5 && cargo publish -p bar/);
  });
  test("three workspace crates inserts sleep before second and third", () => {
    const cmds = buildPublishCommands(["a", "b", "c"], "crates.io");
    expect(cmds[0]).not.toContain("sleep");
    expect(cmds[1]).toContain("sleep 5");
    expect(cmds[2]).toContain("sleep 5");
  });
  test("custom registry appends --registry flag", () => {
    const cmds = buildPublishCommands([], "my-private-registry");
    expect(cmds[0]).toContain("--registry my-private-registry");
  });
  test("named crate with custom registry includes both -p and --registry", () => {
    const cmds = buildPublishCommands(["my-lib"], "private");
    expect(cmds[0]).toContain("-p my-lib");
    expect(cmds[0]).toContain("--registry private");
  });
});

// ─── Version injection decision ───────────────────────────────────────────────

function shouldInjectVersion(
  normalizedVersion: string,
  manifestVersion: string,
): boolean {
  return Boolean(normalizedVersion) && normalizedVersion !== manifestVersion;
}

describe("shouldInjectVersion", () => {
  test("injects when version differs from manifest", () => {
    expect(shouldInjectVersion("1.3.0", "1.2.0")).toBe(true);
  });
  test("injects when stripping v results in different version", () => {
    // normalizeVersion already strips v, so this tests a version that was pre-stripped
    expect(shouldInjectVersion("2.0.0", "1.0.0")).toBe(true);
  });
  test("does not inject when versions are the same", () => {
    expect(shouldInjectVersion("1.2.3", "1.2.3")).toBe(false);
  });
  test("does not inject when normalizedVersion is empty (non-version input)", () => {
    expect(shouldInjectVersion("", "1.2.3")).toBe(false);
  });
  test("does not inject when both are empty", () => {
    expect(shouldInjectVersion("", "")).toBe(false);
  });
  test("injects when manifest has pre-release and override is stable", () => {
    expect(shouldInjectVersion("1.0.0", "1.0.0-beta.1")).toBe(true);
  });
});

// ─── Crate list resolution ────────────────────────────────────────────────────
// Mirror the logic that determines which crates to publish.

function resolveCratesToPublish(opts: {
  workspace: boolean;
  crate: string;
  isWorkspace: boolean;
  memberNames: string[];
}): string[] {
  if (opts.isWorkspace && opts.workspace && !opts.crate) {
    return opts.memberNames;
  }
  if (opts.crate) {
    return [opts.crate];
  }
  return [];
}

describe("resolveCratesToPublish", () => {
  test("returns empty for single-crate repo with no crate param", () => {
    expect(
      resolveCratesToPublish({
        workspace: false,
        crate: "",
        isWorkspace: false,
        memberNames: [],
      }),
    ).toEqual([]);
  });
  test("returns specific crate when crate param is set (single-crate)", () => {
    expect(
      resolveCratesToPublish({
        workspace: false,
        crate: "my-lib",
        isWorkspace: false,
        memberNames: [],
      }),
    ).toEqual(["my-lib"]);
  });
  test("returns all members for workspace-all", () => {
    expect(
      resolveCratesToPublish({
        workspace: true,
        crate: "",
        isWorkspace: true,
        memberNames: ["foo", "bar", "baz"],
      }),
    ).toEqual(["foo", "bar", "baz"]);
  });
  test("crate param wins over workspace-all", () => {
    expect(
      resolveCratesToPublish({
        workspace: true,
        crate: "foo",
        isWorkspace: true,
        memberNames: ["foo", "bar"],
      }),
    ).toEqual(["foo"]);
  });
  test("workspace=true but not a workspace repo → returns empty (publishes root)", () => {
    // If the caller passes workspace=true but the repo is not a workspace, we
    // fall through to the empty case (publish root without -p).
    expect(
      resolveCratesToPublish({
        workspace: true,
        crate: "",
        isWorkspace: false,
        memberNames: [],
      }),
    ).toEqual([]);
  });
  test("workspace=false + crate set still publishes named crate", () => {
    expect(
      resolveCratesToPublish({
        workspace: false,
        crate: "specific-crate",
        isWorkspace: true,
        memberNames: ["specific-crate", "other"],
      }),
    ).toEqual(["specific-crate"]);
  });
  test("empty memberNames with workspace=true returns empty (no-op publish)", () => {
    expect(
      resolveCratesToPublish({
        workspace: true,
        crate: "",
        isWorkspace: true,
        memberNames: [],
      }),
    ).toEqual([]);
  });
});

// ─── Package args building ────────────────────────────────────────────────────

function buildPackageArgs(opts: {
  isWorkspace: boolean;
  workspace: boolean;
  crate: string;
}): readonly [string, ...string[]] {
  if (opts.isWorkspace && opts.workspace && !opts.crate) {
    return ["cargo", "package", "--workspace", "--allow-dirty"];
  }
  if (opts.crate) {
    return ["cargo", "package", "-p", opts.crate, "--allow-dirty"];
  }
  return ["cargo", "package", "--allow-dirty"];
}

describe("buildPackageArgs", () => {
  test("single-crate root uses bare cargo package", () => {
    expect(buildPackageArgs({ isWorkspace: false, workspace: false, crate: "" })).toEqual([
      "cargo",
      "package",
      "--allow-dirty",
    ]);
  });
  test("workspace-all uses --workspace flag", () => {
    expect(buildPackageArgs({ isWorkspace: true, workspace: true, crate: "" })).toEqual([
      "cargo",
      "package",
      "--workspace",
      "--allow-dirty",
    ]);
  });
  test("named crate uses -p flag", () => {
    expect(buildPackageArgs({ isWorkspace: false, workspace: false, crate: "foo" })).toEqual([
      "cargo",
      "package",
      "-p",
      "foo",
      "--allow-dirty",
    ]);
  });
  test("named crate in workspace uses -p flag (not --workspace)", () => {
    expect(buildPackageArgs({ isWorkspace: true, workspace: true, crate: "foo" })).toEqual([
      "cargo",
      "package",
      "-p",
      "foo",
      "--allow-dirty",
    ]);
  });
});
