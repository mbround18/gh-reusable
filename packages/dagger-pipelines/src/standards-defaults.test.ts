import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");

type Defaults = {
  node: { version: string; debianImageSuffix: string };
  rust: { toolchain: string; debianImageSuffix: string };
  python: { version: string; debianImageSuffix: string };
  go: { version: string; debianImageSuffix: string };
  ruby: { version: string; debianImageSuffix: string };
  java: { version: string; distribution: string; debianImageSuffix: string };
  debian: { version: string; codename: string };
};

function readText(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function readDefaults(): Defaults {
  return JSON.parse(readText("defaults.json")) as Defaults;
}

function listReusableWorkflowFiles(): string[] {
  const workflowsDir = path.join(repositoryRoot, ".github", "workflows");
  return readdirSync(workflowsDir)
    .filter(
      (name) =>
        (name.endsWith(".yml") || name.endsWith(".yaml")) &&
        !name.startsWith("test-"),
    )
    .sort();
}

test("defaults.json follows core standards shape", () => {
  const defaults = readDefaults();
  const schema = JSON.parse(readText("defaults.schema.json")) as {
    required?: string[];
  };

  const required = schema.required ?? [];
  expect(Object.keys(defaults).sort()).toEqual([...required].sort());

  expect(defaults.node.version).toMatch(/^[0-9]+$/);
  expect(defaults.rust.toolchain).toMatch(/^[0-9]+\.[0-9]+(\.[0-9]+)?$/);
  expect(defaults.python.version).toMatch(/^[0-9]+\.[0-9]+$/);
  expect(defaults.go.version).toMatch(/^[0-9]+\.[0-9]+$/);
  expect(defaults.ruby.version).toMatch(/^[0-9]+\.[0-9]+$/);
  expect(defaults.java.version).toMatch(/^[0-9]+$/);
  expect(defaults.debian.version).toMatch(/^[0-9]+$/);
  expect(defaults.node.debianImageSuffix).toContain(defaults.debian.codename);
  expect(defaults.rust.debianImageSuffix).toContain(defaults.debian.codename);
});

test("standards-critical code paths are wired to defaults.json", () => {
  const wiredFiles = [
    "packages/dagger-module/src/index.ts",
    "packages/dagger-pipelines/src/index.ts",
    "packages/dagger-pipelines/src/workflows.ts",
    "scripts/generate-ci-skill.ts",
  ];

  for (const file of wiredFiles) {
    const source = readText(file);
    expect(
      source.includes("defaults.json"),
      `${file} must read defaults.json instead of hardcoding runtime standards`,
    ).toBe(true);
  }
});

test("dockerfiles and workflow defaults align with defaults.json", () => {
  const defaults = readDefaults();
  const expectedNodeSlim = `node:${defaults.node.version}-${defaults.node.debianImageSuffix}-slim`;

  const rootDockerfile = readText("Dockerfile");
  const semverDockerfile = readText("actions/semver/Dockerfile");
  expect(rootDockerfile).toContain(`FROM ${expectedNodeSlim}`);
  expect(semverDockerfile).toContain(`FROM ${expectedNodeSlim}`);

  const rustWorkflow = readText(".github/workflows/rust-build-n-test.yaml");
  const rustBinaryRelease = readText(
    ".github/workflows/rust-binary-release.yaml",
  );
  const setupRustAction = readText("actions/setup-rust/action.yml");
  expect(rustWorkflow).toContain(`default: "${defaults.rust.toolchain}"`);
  expect(rustBinaryRelease).toContain(`default: "${defaults.rust.toolchain}"`);
  expect(setupRustAction).toContain(`default: "${defaults.rust.toolchain}"`);
});

test("legacy runtime literals are banned in standards-critical files", () => {
  const targets = [
    "packages/dagger-module/src/index.ts",
    "packages/dagger-pipelines/src/index.ts",
    "packages/dagger-pipelines/src/workflows.ts",
    ".github/workflows/rust-build-n-test.yaml",
    ".github/workflows/rust-binary-release.yaml",
    "actions/setup-rust/action.yml",
    "scripts/generate-ci-skill.ts",
  ];
  const forbidden =
    /(bookworm|bullseye|toolchain=stable|default:\s*"stable"|INPUT_TOOLCHAIN:-stable)/;

  for (const file of targets) {
    const source = readText(file);
    expect(
      forbidden.test(source),
      `${file} contains forbidden runtime literal drift`,
    ).toBe(false);
  }
});

test("all reusable workflows declare explicit permissions", () => {
  const reusableWorkflows = listReusableWorkflowFiles();
  expect(reusableWorkflows.length).toBeGreaterThan(0);

  for (const file of reusableWorkflows) {
    const source = readText(path.join(".github", "workflows", file));
    expect(
      source.includes("permissions:"),
      `${file} must declare explicit permissions`,
    ).toBe(true);
  }
});
