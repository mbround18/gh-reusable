const core = require("@actions/core");
const generateTags = require("../src/generateTags");

// Mock core functions
jest.mock("@actions/core");

describe("generateTags function - GitHub Context Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should add PR-specific tags when in pull request context", () => {
    // Set up with PR number as branch parameter
    const result = generateTags("myapp", "1.0.0", "pr-123", ["docker.io"]);

    expect(result).toContain("myapp:pr-123");
    expect(result).toContain("docker.io/myapp:pr-123");
  });

  test("should automatically add PR prefix to numeric branch values", () => {
    // Set up with numeric branch parameter that should get PR- prefix
    const result = generateTags("myapp", "1.0.0", "123", ["docker.io"]);

    // Verify PR-prefixed tags are created
    expect(result).toContain("myapp:pr-123");
    expect(result).toContain("docker.io/myapp:pr-123");
  });

  test("should add branch-specific tags when in branch context", () => {
    // Set up with branch name
    const result = generateTags("myapp", "1.0.0", "feature-branch", [
      "docker.io",
    ]);

    expect(result).toContain("myapp:feature-branch");
    expect(result).toContain("docker.io/myapp:feature-branch");
  });

  test("should sanitize branch names with invalid characters", () => {
    // Set up with branch name containing invalid characters
    const result = generateTags(
      "myapp",
      "1.0.0",
      "feature/branch with invalid@chars",
      ["docker.io"],
    );

    // Branch name should be sanitized
    expect(result).toContain("myapp:feature-branch-with-invalid-chars");
    expect(result).toContain(
      "docker.io/myapp:feature-branch-with-invalid-chars",
    );
  });

  test("should skip branch tags for main/master branches", () => {
    // Test main branch
    const resultMain = generateTags("myapp", "1.0.0", "main", ["docker.io"]);
    expect(resultMain).not.toContain("myapp:main");
    expect(resultMain).not.toContain("docker.io/myapp:main");

    // Test master branch
    const resultMaster = generateTags("myapp", "1.0.0", "master", [
      "docker.io",
    ]);
    expect(resultMaster).not.toContain("myapp:master");
    expect(resultMaster).not.toContain("docker.io/myapp:master");
  });

  test("should handle invalid image name format", () => {
    const result = generateTags("invalid:image:format", "1.0.0", null, [
      "docker.io",
    ]);

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Image already has a tag: invalid:image:format"),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  test("should warn about invalid image name with commas", () => {
    const result = generateTags("invalid,image,format", "1.0.0", null, [
      "docker.io",
    ]);

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid image name format: invalid,image,format contains commas",
      ),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  test("should handle non-semver versions", () => {
    const result = generateTags("myapp", "not-a-version", null, ["docker.io"]);

    // Should have the basic tag but not generate semver cascading tags
    expect(result).toContain("myapp:not-a-version");
    expect(result).toContain("docker.io/myapp:not-a-version");
    expect(result).not.toContain("myapp:not"); // Should not generate invalid cascading tags
  });
});
