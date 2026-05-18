import { describe, test, beforeEach, vi, expect } from "vitest";

const mockCore = {
  getInput: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
};

const mockExec = {
  exec: vi.fn(),
};

const mockFs = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
};

vi.mock("@actions/core", () => mockCore);
vi.mock("@actions/exec", () => mockExec);
vi.mock("fs", () => mockFs);
vi.mock("path", () => ({
  join: (...parts) => parts.join("/"),
}));

describe("docker-build action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUNNER_TEMP = "/tmp";
    process.env.GITHUB_SERVER_URL = "https://github.com";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_RUN_ID = "12345";
    process.env.GITHUB_RUN_ATTEMPT = "1";
  });

  describe("tag parsing", () => {
    test("should handle single tag", async () => {
      mockCore.getInput.mockImplementation((name) => {
        switch (name) {
          case "image":
            return "myrepo/myimage:latest";
          case "dockerfile":
            return "Dockerfile";
          case "context":
            return ".";
          case "platforms":
            return "linux/amd64";
          default:
            return "";
        }
      });
      mockExec.exec.mockResolvedValue(0);
      mockFs.existsSync.mockReturnValue(false);

      // We need to load the module fresh to avoid caching
      delete require.cache[require.resolve("./index.js")];
      const { splitTags } = await import("./index.test-helpers.js");

      const tags = splitTags("myrepo/myimage:latest");
      expect(tags).toEqual(["myrepo/myimage:latest"]);
    });

    test("should handle multiple comma-separated tags", () => {
      const { splitTags } = require("./index.test-helpers.js");
      const tags = splitTags("myrepo/image:v1, myrepo/image:latest");
      expect(tags).toHaveLength(2);
      expect(tags).toContain("myrepo/image:v1");
      expect(tags).toContain("myrepo/image:latest");
    });

    test("should fix malformed tags with colons", () => {
      const { fixMalformedTag } = require("./index.test-helpers.js");
      const fixed = fixMalformedTag("registry.io:5000/myimage:v1.0.0");
      // Malformed tags with >2 parts should keep first two parts before colon
      expect(fixed).toBe("registry.io:5000/myimage");
    });

    test("should trim whitespace from tags", () => {
      const { splitTags } = require("./index.test-helpers.js");
      const tags = splitTags("  myimage:v1  ,  myimage:latest  ");
      expect(tags).toEqual(["myimage:v1", "myimage:latest"]);
    });

    test("should deduplicate tags", () => {
      const { deduplicateTags } = require("./index.test-helpers.js");
      const tags = deduplicateTags(["myimage:v1", "myimage:v1", "myimage:latest"]);
      expect(tags).toHaveLength(2);
      expect(new Set(tags).size).toBe(2);
    });

    test("should filter empty tags", () => {
      const { splitTags } = require("./index.test-helpers.js");
      const tags = splitTags("myimage:v1,,myimage:latest");
      expect(tags).not.toContain("");
    });
  });

  describe("build arguments", () => {
    test("should parse build args from input", () => {
      const { parseBuildArgs } = require("./index.test-helpers.js");
      const args = parseBuildArgs("KEY1=value1 KEY2=value2");
      expect(args).toEqual(["KEY1=value1", "KEY2=value2"]);
    });

    test("should handle BUILD_ARG_ environment variables", () => {
      const { extractBuildArgEnvVars } = require("./index.test-helpers.js");
      process.env.BUILD_ARG_MYVAR = "myvalue";
      process.env.BUILD_ARG_ANOTHER = "anothervalue";
      process.env.OTHER_VAR = "ignored";

      const args = extractBuildArgEnvVars();
      expect(args).toContainEqual("MYVAR=myvalue");
      expect(args).toContainEqual("ANOTHER=anothervalue");
      expect(args).not.toContain("OTHER_VAR=ignored");

      delete process.env.BUILD_ARG_MYVAR;
      delete process.env.BUILD_ARG_ANOTHER;
    });

    test("should combine input args and env vars", () => {
      const { combineBuildArgs } = require("./index.test-helpers.js");
      process.env.BUILD_ARG_ENV_VAR = "envvalue";

      const combined = combineBuildArgs("INPUT_ARG=inputvalue", process.env);
      expect(combined).toContain("INPUT_ARG=inputvalue");
      expect(combined.some((arg) => arg.includes("ENV_VAR=envvalue"))).toBe(true);

      delete process.env.BUILD_ARG_ENV_VAR;
    });
  });

  describe("docker buildx command construction", () => {
    test("should build basic command", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      expect(cmd[0]).toBe("buildx");
      expect(cmd[1]).toBe("build");
      expect(cmd).toContain("--file");
      expect(cmd).toContain("Dockerfile");
      expect(cmd).toContain("--platform");
      expect(cmd).toContain("linux/amd64");
      expect(cmd).toContain("--load");
    });

    test("should add --push when push is true", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: true,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      expect(cmd).toContain("--push");
      expect(cmd).not.toContain("--load");
    });

    test("should include all tags", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1", "myimage:latest"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      const tagIndices = cmd
        .map((item, i) => (item === "--tag" ? i : -1))
        .filter((i) => i !== -1);
      expect(tagIndices).toHaveLength(2);
      expect(cmd[tagIndices[0] + 1]).toBe("myimage:v1");
      expect(cmd[tagIndices[1] + 1]).toBe("myimage:latest");
    });

    test("should add target when specified", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "production",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      const targetIdx = cmd.indexOf("--target");
      expect(targetIdx).not.toBe(-1);
      expect(cmd[targetIdx + 1]).toBe("production");
    });

    test("should add build args", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: ["KEY1=value1", "KEY2=value2"],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      const argIndices = cmd
        .map((item, i) => (item === "--build-arg" ? i : -1))
        .filter((i) => i !== -1);
      expect(argIndices.length).toBeGreaterThanOrEqual(2);
    });

    test("should include metadata file", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      const metadataIdx = cmd.indexOf("--metadata-file");
      expect(metadataIdx).not.toBe(-1);
      expect(cmd[metadataIdx + 1]).toBe("/tmp/metadata.json");
    });

    test("should include provenance attestation", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      const attestIdx = cmd.indexOf("--attest");
      expect(attestIdx).not.toBe(-1);
      expect(cmd[attestIdx + 1]).toContain("type=provenance");
      expect(cmd[attestIdx + 1]).toContain(
        "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      );
    });

    test("should end with context", () => {
      const { buildDockerCommand } = require("./index.test-helpers.js");

      const cmd = buildDockerCommand({
        tags: ["myimage:v1"],
        dockerfile: "Dockerfile",
        context: ".",
        platforms: "linux/amd64",
        push: false,
        target: "",
        buildArgs: [],
        metadataFile: "/tmp/metadata.json",
        provenanceUrl:
          "https://github.com/owner/repo/actions/runs/12345/attempts/1",
      });

      expect(cmd[cmd.length - 1]).toBe(".");
    });
  });
});
