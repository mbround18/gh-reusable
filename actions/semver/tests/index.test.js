import { describe, test, beforeEach, afterEach, vi, expect } from "vitest";
const core = require("@actions/core");
const github = require("@actions/github");
const { run } = require("../src/index");
const { getLastTag } = require("../src/tag");
const { detectIncrement } = require("../src/increment");
const { buildNewVersion } = require("../src/version");

// Mock all dependencies
vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("../src/tag");
vi.mock("../src/increment");
vi.mock("../src/version");

// Create mock Octokit instance
const mockOctokit = {
  rest: {
    repos: {
      createRelease: vi.fn(),
    },
  },
};

describe("index.js", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock getInput
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "token":
          return "test-token";
        case "base":
          return "";
        case "prefix":
          return "v";
        case "increment":
          return "";
        case "major-label":
          return "semver:major";
        case "minor-label":
          return "semver:minor";
        case "patch-label":
          return "semver:patch";
        default:
          return "";
      }
    });

    // Mock GitHub context and getOctokit
    github.context.repo = { owner: "testowner", repo: "testrepo" };
    github.context.sha = "1234567890abcdef";
    github.context.eventName = "push";
    github.getOctokit = vi.fn().mockReturnValue(mockOctokit);
  });

  test("should get inputs, generate new version, and set output", async () => {
    // Mock getLastTag
    getLastTag.mockResolvedValue({ lastTag: "v1.0.0", updatedPrefix: "v" });

    // Mock detectIncrement
    detectIncrement.mockResolvedValue("patch");

    // Mock buildNewVersion
    buildNewVersion.mockReturnValue("v1.0.1");

    await run();

    // Verify token was used
    expect(github.getOctokit).toHaveBeenCalledWith("test-token");

    // Verify getLastTag was called with the right parameters
    expect(getLastTag).toHaveBeenCalledWith(
      mockOctokit,
      "testowner",
      "testrepo",
      "v",
      "",
      core,
    );

    // Verify detectIncrement was called with the right parameters
    expect(detectIncrement).toHaveBeenCalledWith(
      mockOctokit,
      "testowner",
      "testrepo",
      "",
      "semver:major",
      "semver:minor",
      "semver:patch",
      core,
    );

    // Verify buildNewVersion was called with the right parameters
    expect(buildNewVersion).toHaveBeenCalledWith(
      "v1.0.0",
      "v",
      "patch",
      false,
      "1234567890abcdef",
      core,
    );

    // Verify output was set
    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v1.0.1");
  });

  test("should handle pull_request event when skip-pr is false", async () => {
    // Set event to pull_request
    github.context.eventName = "pull_request";

    // Mock getLastTag
    getLastTag.mockResolvedValue({ lastTag: "v1.0.0", updatedPrefix: "v" });

    // Mock detectIncrement
    detectIncrement.mockResolvedValue("patch");

    // Mock buildNewVersion
    buildNewVersion.mockReturnValue("v1.0.1-pr.1234567");

    await run();

    // Verify output was set
    expect(core.setOutput).toHaveBeenCalledWith(
      "new_version",
      "v1.0.1-pr.1234567",
    );
  });

  test("should handle errors gracefully", async () => {
    // Make getLastTag throw an error
    getLastTag.mockRejectedValue(new Error("Test error"));

    await run();

    // Verify error was set
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Test error"),
    );
  });

  test("should use an environment token if token input not provided", async () => {
    // Don't provide token via input
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "";
      // Use switch for other inputs like in beforeEach
      switch (name) {
        case "base":
          return "";
        case "prefix":
          return "v";
        case "increment":
          return "";
        case "major-label":
          return "semver:major";
        case "minor-label":
          return "semver:minor";
        case "patch-label":
          return "semver:patch";
        default:
          return "";
      }
    });

    // Set environment token
    process.env.GITHUB_TOKEN = "env-token";

    // Mock necessary functions
    getLastTag.mockResolvedValue({ lastTag: "v1.0.0", updatedPrefix: "v" });
    detectIncrement.mockResolvedValue("patch");
    buildNewVersion.mockReturnValue("v1.0.1");

    await run();

    // Verify environment token was used
    expect(github.getOctokit).toHaveBeenCalledWith("env-token");

    // Clean up
    delete process.env.GITHUB_TOKEN;
  });

  test("should fail if no token available", async () => {
    // Don't provide token via input
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "";
      // Use switch for other inputs like in beforeEach
      switch (name) {
        case "base":
          return "";
        case "prefix":
          return "v";
        case "increment":
          return "";
        case "major-label":
          return "semver:major";
        case "minor-label":
          return "semver:minor";
        case "patch-label":
          return "semver:patch";
        default:
          return "";
      }
    });

    // Ensure no environment token
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    await run();

    // Verify error was set
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("token is required"),
    );

    // Restore original token if it existed
    if (originalToken) {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  test("should handle tag event correctly", async () => {
    // Set event to tag
    github.context.eventName = "tag";

    // Mock getLastTag
    getLastTag.mockResolvedValue({ lastTag: "v1.0.0", updatedPrefix: "v" });

    // Mock detectIncrement
    detectIncrement.mockResolvedValue("patch");

    // Mock buildNewVersion
    buildNewVersion.mockReturnValue("v1.0.1");

    await run();

    // Verify output was set
    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v1.0.1");
  });
});
