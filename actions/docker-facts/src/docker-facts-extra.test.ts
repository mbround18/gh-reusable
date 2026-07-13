import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { generateTags, shouldPushImage, resolvePath } from "./lib";

// ─── generateTags — edge cases ────────────────────────────────────────────────

describe("generateTags — target prefix", () => {
  const base = {
    image: "ghcr.io/org/app",
    version: "1.0.0",
    ref: "refs/tags/v1.0.0",
    registries: [] as string[],
    withLatest: false,
    prependTarget: false,
    target: "",
  };

  test("adds target prefix when prependTarget=true and target is set", () => {
    const tags = generateTags({
      ...base,
      prependTarget: true,
      target: "alpine",
    });
    expect(tags.some((t) => t.includes("alpine-v1.0.0"))).toBe(true);
  });

  test("no target prefix when prependTarget=false", () => {
    const tags = generateTags({ ...base, prependTarget: false, target: "alpine" });
    expect(tags.every((t) => !t.includes("alpine-"))).toBe(true);
  });

  test("no target prefix when target is empty string", () => {
    const tags = generateTags({ ...base, prependTarget: true, target: "" });
    expect(tags[0]).not.toContain("-v");
  });

  test("withLatest=true on tag ref adds :latest tag", () => {
    const tags = generateTags({ ...base, withLatest: true });
    expect(tags.some((t) => t.endsWith(":latest"))).toBe(true);
  });

  test("withLatest=true on non-tag ref does NOT add :latest", () => {
    const tags = generateTags({
      ...base,
      withLatest: true,
      ref: "refs/heads/main",
    });
    expect(tags.every((t) => !t.endsWith(":latest"))).toBe(true);
  });

  test("withLatest=true for pre-release version on tag ref does NOT add :latest", () => {
    const tags = generateTags({
      ...base,
      version: "1.0.0-beta.1",
      ref: "refs/tags/v1.0.0-beta.1",
      withLatest: true,
    });
    expect(tags.every((t) => !t.endsWith(":latest"))).toBe(true);
  });

  test("adds v prefix when version does not start with v", () => {
    const tags = generateTags({ ...base, version: "1.2.3" });
    expect(tags.some((t) => t.includes(":v1.2.3"))).toBe(true);
  });

  test("does not double-add v prefix when version already starts with v", () => {
    const tags = generateTags({ ...base, version: "v1.2.3" });
    expect(tags.some((t) => t.includes(":v1.2.3"))).toBe(true);
    expect(tags.every((t) => !t.includes(":vv"))).toBe(true);
  });
});

describe("generateTags — registry replication", () => {
  const base = {
    image: "org/app",
    version: "1.0.0",
    ref: "refs/tags/v1.0.0",
    registries: ["docker.io", "ghcr.io"],
    withLatest: false,
    prependTarget: false,
    target: "",
  };

  test("replicates tag to all additional registries", () => {
    const tags = generateTags(base);
    expect(tags.some((t) => t.startsWith("docker.io/"))).toBe(true);
    expect(tags.some((t) => t.startsWith("ghcr.io/"))).toBe(true);
  });

  test("strips registry from image when building replicated tags", () => {
    const tags = generateTags({
      ...base,
      image: "ghcr.io/org/app",
    });
    // Should not produce ghcr.io/ghcr.io/org/app
    expect(tags.every((t) => !t.includes("ghcr.io/ghcr.io"))).toBe(true);
  });
});

// ─── shouldPushImage — edge cases ────────────────────────────────────────────

describe("shouldPushImage — edge cases", () => {
  const base = {
    eventName: "push",
    ref: "refs/heads/main",
    defaultBranch: "main",
    canaryLabel: "canary",
    forcePush: false,
  };

  test("does not push on push event to non-default branch", () => {
    expect(
      shouldPushImage({ ...base, ref: "refs/heads/feature/my-feature" }),
    ).toBe(false);
  });

  test("pushes on any tag ref regardless of branch", () => {
    expect(
      shouldPushImage({ ...base, ref: "refs/tags/v99.0.0" }),
    ).toBe(true);
  });

  test("does not push on workflow_dispatch event to non-default branch without force", () => {
    expect(
      shouldPushImage({
        ...base,
        eventName: "workflow_dispatch",
        ref: "refs/heads/feature/x",
      }),
    ).toBe(false);
  });

  test("force push overrides everything", () => {
    expect(
      shouldPushImage({
        ...base,
        forcePush: true,
        ref: "refs/heads/feature/x",
        eventName: "pull_request",
      }),
    ).toBe(true);
  });

  test("PR without canary label → no push", () => {
    const dir = path.join(tmpdir(), `df-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const eventPath = path.join(dir, "event.json");
    writeFileSync(eventPath, JSON.stringify({ pull_request: { labels: [{ name: "bug" }] } }));
    expect(
      shouldPushImage({
        ...base,
        eventName: "pull_request",
        ref: "refs/pull/1/merge",
        eventPath,
      }),
    ).toBe(false);
  });

  test("PR with canary label → push", () => {
    const dir = path.join(tmpdir(), `df-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const eventPath = path.join(dir, "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { labels: [{ name: "canary" }, { name: "bug" }] } }),
    );
    expect(
      shouldPushImage({
        ...base,
        eventName: "pull_request",
        ref: "refs/pull/1/merge",
        eventPath,
      }),
    ).toBe(true);
  });
});

// ─── resolvePath ─────────────────────────────────────────────────────────────

describe("resolvePath — toAbsolute mode (default)", () => {
  const workspace = "/workspace";

  test("returns empty string for empty value", () => {
    expect(resolvePath(workspace, "")).toBe("");
  });

  test("returns absolute path unchanged when already absolute", () => {
    expect(resolvePath(workspace, "/other/path")).toBe("/other/path");
  });

  test("resolves relative path against workspace", () => {
    const result = resolvePath(workspace, "./app");
    expect(result).toBe("/workspace/app");
  });

  test("strips leading ./ from relative path", () => {
    const result = resolvePath(workspace, "./Dockerfile");
    expect(result).toBe("/workspace/Dockerfile");
  });

  test("resolves nested relative path", () => {
    const result = resolvePath(workspace, "src/app");
    expect(result).toBe("/workspace/src/app");
  });
});

describe("resolvePath — toRelative mode", () => {
  const workspace = "/workspace";

  test("converts workspace-absolute path to relative ./path", () => {
    const result = resolvePath(workspace, "/workspace/app", true);
    expect(result).toBe("./app");
  });

  test("returns path unchanged when outside workspace", () => {
    const result = resolvePath(workspace, "/other/path", true);
    expect(result).toBe("/other/path");
  });

  test("returns empty string for empty value", () => {
    expect(resolvePath(workspace, "", true)).toBe("");
  });

  test("deeply nested workspace path → relative", () => {
    const result = resolvePath(workspace, "/workspace/src/lib/index.ts", true);
    expect(result).toBe("./src/lib/index.ts");
  });
});
