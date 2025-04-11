const core = require("@actions/core");
const generateTags = require("../src/generateTags");

// Mock @actions/core
jest.mock("@actions/core");

describe("generateTags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should generate basic tags without registries", () => {
    const result = generateTags("myapp", "v1.0.0");

    expect(result).toContain("myapp:v1.0.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("myapp:v1.0");
    expect(result).toContain("myapp:v1");
    // No registry prefixes since registries=undefined
    expect(result).not.toContain("myapp:1.0");
    expect(result).not.toContain("myapp:1");

    // Default registry is docker.io when none specified
    expect(result).toContain("docker.io/myapp:v1.0.0");
    expect(result).toContain("docker.io/myapp:latest");

    // Accounting for the default docker.io registry tags
    expect(result.length).toBe(8); // 4 tags * 2 variations (bare + docker.io)
  });

  test("should include registry prefixes", () => {
    const registries = ["docker.io", "ghcr.io"];
    const result = generateTags("myapp", "v1.0.0", null, registries);

    // Base image tags
    expect(result).toContain("myapp:v1.0.0");
    expect(result).toContain("docker.io/myapp:v1.0.0");
    expect(result).toContain("ghcr.io/myapp:v1.0.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("ghcr.io/myapp:latest");

    // Cascading versions
    expect(result).toContain("myapp:v1.0");
    expect(result).toContain("docker.io/myapp:v1.0");
    expect(result).toContain("ghcr.io/myapp:v1.0");
    expect(result).toContain("myapp:v1");
    expect(result).toContain("docker.io/myapp:v1");
    expect(result).toContain("ghcr.io/myapp:v1");

    // Total: 4 tags * 3 registry variations (including no registry) = 12 tags
    expect(result.length).toBe(12);
  });

  test("should automatically generate cascading versions for semver", () => {
    const registries = ["docker.io"];
    const result = generateTags("myapp", "1.2.3", null, registries);

    expect(result).toContain("myapp:1.2.3");
    expect(result).toContain("docker.io/myapp:1.2.3");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("myapp:1.2");
    expect(result).toContain("docker.io/myapp:1.2");
    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result.length).toBe(8); // 4 tags * 2 registry variations = 8
  });

  test("should skip cascading for versions that are non semver", () => {
    const result = generateTags("myapp", "release-candidate", null, [
      "docker.io",
    ]);

    expect(result).toStrictEqual([
      "myapp:release-candidate",
      "docker.io/myapp:release-candidate",
    ]);
  });

  test("should skip latest tag for beta versions", () => {
    const result = generateTags("myapp", "1.0.0-beta", null, ["docker.io"]);

    expect(result).toContain("myapp:1.0.0-beta");
    expect(result).toContain("docker.io/myapp:1.0.0-beta");
    expect(result).not.toContain("myapp:latest");
    expect(result).not.toContain("docker.io/myapp:latest");
    expect(result.length).toBe(2);
  });

  test("should handle zero-prefixed versions by not adding cascading tags", () => {
    const result = generateTags("myapp", "0.1.0", null, ["docker.io"]);

    expect(result).toContain("myapp:0.1.0");
    expect(result).toContain("docker.io/myapp:0.1.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    // No cascading tags for 0.x.x versions
    expect(result.length).toBe(4);
  });

  test("should not duplicate tags when cascading version equals main version", () => {
    const result = generateTags("myapp", "1", null, ["docker.io"]);

    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result.length).toBe(4);
  });

  test("should handle versions with only two parts", () => {
    const result = generateTags("myapp", "1.2", null, ["docker.io"]);

    expect(result).toContain("myapp:1.2");
    expect(result).toContain("docker.io/myapp:1.2");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result.length).toBe(6);
  });

  test("should generate basic tags", () => {
    const result = generateTags("myapp", "v1.0.0", null, []);
    expect(result).toEqual([
      "myapp:v1.0.0",
      "myapp:latest",
      "myapp:v1.0",
      "myapp:v1",
    ]);
  });

  test("should add branch-specific tags", () => {
    const result = generateTags("myapp", "v1.0.0", "feature-branch", [
      "docker.io",
    ]);

    // Should contain the branch tag
    expect(result).toContain("myapp:feature-branch");
    expect(result).toContain("docker.io/myapp:feature-branch");

    // Still has normal semver tags
    expect(result).toContain("myapp:v1.0.0");
    expect(result).toContain("docker.io/myapp:v1.0.0");
  });

  test("should handle default version when not provided", () => {
    const result = generateTags("myapp", "", null, ["docker.io"]);

    expect(result).toEqual(["myapp:latest", "docker.io/myapp:latest"]);
  });
});
