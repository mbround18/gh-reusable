const github = require("@actions/github");
const { buildNewVersion } = require("../src/version");

describe("buildNewVersion", () => {
  const mockCore = {
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GITHUB_REF;
    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abc123456789",
      ref: "refs/heads/main",
    };
  });

  test("should increment patch version correctly", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.2.4");
  });

  test("should increment minor version correctly", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "minor",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.3.0");
  });

  test("should increment major version correctly", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "major",
      false,
      "abc123456789",
    );
    expect(result).toBe("v2.0.0");
  });

  test("should log inputs when core is provided", () => {
    buildNewVersion("v1.2.3", "v", "patch", false, "abc123456789", mockCore);

    expect(mockCore.startGroup).toHaveBeenCalledWith("Building new version");
    expect(mockCore.info).toHaveBeenCalledWith("Last tag: v1.2.3");
    expect(mockCore.info).toHaveBeenCalledWith("Prefix: v");
    expect(mockCore.info).toHaveBeenCalledWith("Increment: patch");
    expect(mockCore.info).toHaveBeenCalledWith("Is PR: false");
    expect(mockCore.info).toHaveBeenCalledWith("SHA: abc123456789");
    expect(mockCore.endGroup).toHaveBeenCalled();
  });

  test("should log return exact tag when on tag and core is provided", () => {
    process.env.GITHUB_REF = "refs/tags/v3.0.0";

    buildNewVersion("v1.2.3", "v", "patch", false, "abc123456789", mockCore);

    expect(mockCore.info).toHaveBeenCalledWith(
      "Running on tag: v3.0.0, returning exactly this tag",
    );
  });

  test("should handle PR with no increment", () => {
    const result = buildNewVersion("v1.2.3", "v", null, true, "abc123456789");
    expect(result).toBe("v1.2.3-abc1234");
  });

  test("should handle PR with major label increment", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "major",
      true,
      "abc123456789",
    );
    expect(result).toBe("v2.0.0-abc1234");
  });

  test("should handle PR with minor label increment", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "minor",
      true,
      "abc123456789",
    );
    expect(result).toBe("v1.3.0-abc1234");
  });

  test("should handle PR with patch label increment", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "patch",
      true,
      "abc123456789",
    );
    expect(result).toBe("v1.2.4-abc1234");
  });

  test("should handle tags with complex prefixes", () => {
    const result = buildNewVersion(
      "my-project-1.2.3",
      "my-project-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("my-project-1.2.4");
  });

  test("should handle tags with dashes correctly", () => {
    const result = buildNewVersion(
      "app-v-1.2.3",
      "app-v-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("app-v-1.2.4");
  });

  test("should handle v prefix with following dash correctly", () => {
    const result = buildNewVersion(
      "v-1.2.3",
      "v-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v-1.2.4");
  });

  test("should handle simple v prefix correctly", () => {
    const result = buildNewVersion(
      "v1.2.3",
      "v",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.2.4");
  });

  test("should use exact tag version when running on a tag", () => {
    process.env.GITHUB_REF = "refs/tags/v1.5.0";

    const result = buildNewVersion(
      "v1.2.3", // Last tag shouldn't matter in this case
      "v",
      "patch", // Increment type shouldn't matter either
      false,
      "abc123456789",
    );

    expect(result).toBe("v1.5.0");
  });

  test("should preserve prefix when using exact tag version", () => {
    process.env.GITHUB_REF = "refs/tags/app-v2.0.0";

    const result = buildNewVersion(
      "app-v1.0.0",
      "app-v",
      "minor",
      false,
      "abc123456789",
    );

    expect(result).toBe("app-v2.0.0");
  });

  test("should throw error for invalid semver", () => {
    expect(() => {
      buildNewVersion("vX.Y.Z", "v", "patch", false, "abc123456789");
    }).toThrow("Invalid semver");
  });

  test("should throw error for invalid increment type", () => {
    expect(() => {
      buildNewVersion("v1.2.3", "v", "invalid", false, "abc123456789");
    }).toThrow("Failed to increment version");
  });
});
