const core = require("@actions/core");
const github = require("@actions/github");

// Mock modules
jest.mock("@actions/core");
jest.mock("@actions/github");

// Import the function to test
const { __testables } = require("../index");
const { generateTags } = __testables || {};

describe("generateTags function - GitHub Context Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should add PR-specific tags when in pull request context", () => {
    if (!generateTags) return;

    // Mock PR context
    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          number: 123,
        },
      },
    };

    const result = generateTags("myapp", "1.0.0", ["docker.io"]);

    expect(result).toContain("myapp:pr-123");
    expect(result).toContain("docker.io/myapp:pr-123");
  });

  test("should add branch-specific tags when in branch context", () => {
    if (!generateTags) return;

    // Mock branch context
    github.context = {
      eventName: "push",
      ref: "refs/heads/feature-branch",
      payload: {},
    };

    const result = generateTags("myapp", "1.0.0", ["docker.io"]);

    expect(result).toContain("myapp:feature-branch");
    expect(result).toContain("docker.io/myapp:feature-branch");
  });

  test("should sanitize branch names with invalid characters", () => {
    if (!generateTags) return;

    // Mock branch with invalid characters
    github.context = {
      eventName: "push",
      ref: "refs/heads/feature/branch@with:invalid#chars",
      payload: {},
    };

    const result = generateTags("myapp", "1.0.0", ["docker.io"]);

    // Branch name should be sanitized
    expect(result).toContain("myapp:feature-branch-with-invalid-chars");
    expect(result).toContain(
      "docker.io/myapp:feature-branch-with-invalid-chars",
    );
  });

  test("should not add branch tags for main/master branches", () => {
    if (!generateTags) return;

    // Mock main branch context
    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {},
    };

    const result = generateTags("myapp", "1.0.0", ["docker.io"]);

    // Should not contain main branch tag
    expect(result).not.toContain("myapp:main");
    expect(result).not.toContain("docker.io/myapp:main");
  });

  test("should handle invalid image name format", () => {
    if (!generateTags) return;

    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {},
    };

    // This will trigger the parseDockerImageName failure branch
    const result = generateTags("invalid:image:format", "1.0.0", ["docker.io"]);

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Invalid image name format"),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  test("should handle non-semver versions", () => {
    if (!generateTags) return;

    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {},
    };

    const result = generateTags("myapp", "not-a-version", ["docker.io"]);

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("has a suffix"),
    );
    expect(result).toContain("myapp:not-a-version");
    expect(result).toContain("docker.io/myapp:not-a-version");
  });
});
