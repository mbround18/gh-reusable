const core = require("@actions/core");
const github = require("@actions/github");

// Mock modules
jest.mock("@actions/core");
jest.mock("@actions/github");

// Import the function to test
const { __testables } = require("../index");
const { generateTags } = __testables || {};

describe("generateTags function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();

    // Setup default GitHub context
    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {
        repository: {
          default_branch: "main",
        },
      },
    };
  });

  test("should generate basic tags without registries", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "v1.0.0", []);

    expect(result).toContain("myapp:v1.0.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("myapp:v1.0");
    expect(result).toContain("myapp:v1");
    expect(result).not.toContain("myapp:1.0");
    expect(result).not.toContain("myapp:1");
    expect(result.length).toBe(4); // Base tag + latest + 2 cascading versions (v1.0, v1)
  });

  test("should include registry prefixes", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "v1.0.0", ["docker.io", "ghcr.io"]);

    expect(result).toContain("myapp:v1.0.0");
    expect(result).toContain("docker.io/myapp:v1.0.0");
    expect(result).toContain("ghcr.io/myapp:v1.0.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("ghcr.io/myapp:latest");
    expect(result).toContain("myapp:v1.0");
    expect(result).toContain("docker.io/myapp:v1.0");
    expect(result).toContain("ghcr.io/myapp:v1.0");
    expect(result).toContain("myapp:v1");
    expect(result).toContain("docker.io/myapp:v1");
    expect(result).toContain("ghcr.io/myapp:v1");
    expect(result).not.toContain("myapp:1.0");
    expect(result).not.toContain("myapp:1");
  });

  test("should automatically generate cascading versions for semver", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "1.0.0", ["docker.io"]);

    expect(result).toContain("myapp:1.0.0");
    expect(result).toContain("docker.io/myapp:1.0.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("myapp:1.0");
    expect(result).toContain("docker.io/myapp:1.0");
    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result.length).toBe(8);
  });

  test("should skip cascading for versions that are non semver", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "release-candidate", ["docker.io"]);

    expect(result).toStrictEqual(["myapp:release-candidate", "docker.io/myapp:release-candidate"]);
    expect(result.length).toBe(2);
  });

  test("should skip cascading for versions with suffix", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "1.0.0-beta", ["docker.io"]);

    expect(result).toContain("myapp:1.0.0-beta");
    expect(result).toContain("docker.io/myapp:1.0.0-beta");
    expect(result).not.toContain("myapp:latest");
    expect(result).not.toContain("docker.io/myapp:latest");
    expect(result.length).toBe(2);
  });

  test("should handle zero-prefixed versions by not adding cascading tags", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "0.0.1", ["docker.io"]);

    expect(result).toContain("myapp:0.0.1");
    expect(result).toContain("docker.io/myapp:0.0.1");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    // No cascading tags for 0.x.x versions
    expect(result.length).toBe(4);
  });

  test("should not duplicate tags when cascading version equals main version", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "1", ["docker.io"]);

    // Should only have original tags (no cascade for already minimal version)
    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result.length).toBe(4);
  });

  test("should handle versions with only two parts", () => {
    if (!generateTags) return;

    const result = generateTags("myapp", "1.0", ["docker.io"]);

    expect(result).toContain("myapp:1.0");
    expect(result).toContain("docker.io/myapp:1.0");
    expect(result).toContain("myapp:latest");
    expect(result).toContain("docker.io/myapp:latest");
    expect(result).toContain("myapp:1");
    expect(result).toContain("docker.io/myapp:1");
    expect(result.length).toBe(6);
  });
});
