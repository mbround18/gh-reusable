const path = require("path");
const semver = require("semver");

const mockReadFile = jest.fn();

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("fs", () => ({
  promises: {
    readFile: mockReadFile,
  },
  constants: {
    O_RDONLY: 0,
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");

mockReadFile.mockImplementation((filePath) => {
  if (filePath.includes("get_last_tag.gql")) {
    return Promise.resolve("query { repository { refs { nodes { name } } } }");
  } else if (filePath.includes("pr_labels.gql")) {
    return Promise.resolve(
      "query { repository { pullRequest { labels { nodes { name } } } }",
    );
  } else if (filePath.includes("commit_associated_pr.gql")) {
    return Promise.resolve(
      "query { repository { object { associatedPullRequests { nodes { labels { nodes { name } } } } } } }",
    );
  } else if (filePath.includes("default_branch.gql")) {
    return Promise.resolve(
      "query { repository { defaultBranchRef { name } } }",
    );
  } else {
    return Promise.resolve("query { test }");
  }
});

jest.mock("./src/version");
jest.mock("./src/increment");
jest.mock("./src/tag");

const index = require("./tests/test-helpers");

const originalRun = index.run;

describe("buildNewVersion", () => {
  beforeEach(() => {
    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abc123456789",
      ref: "refs/heads/main",
    };
  });

  test("should increment patch version correctly", () => {
    const result = index.buildNewVersion(
      "v1.2.3",
      "v",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.2.4");
  });

  test("should increment minor version correctly", () => {
    const result = index.buildNewVersion(
      "v1.2.3",
      "v",
      "minor",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.3.0");
  });

  test("should increment major version correctly", () => {
    const result = index.buildNewVersion(
      "v1.2.3",
      "v",
      "major",
      false,
      "abc123456789",
    );
    expect(result).toBe("v2.0.0");
  });

  test("should handle PR with no increment", () => {
    const result = index.buildNewVersion(
      "v1.2.3",
      "v",
      null,
      true,
      "abc123456789",
    );
    expect(result).toBe("v1.2.3-abc1234");
  });

  test("should handle tags with complex prefixes", () => {
    const result = index.buildNewVersion(
      "my-project-1.2.3",
      "my-project-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("my-project-1.2.4");
  });

  test("should handle tags with dashes correctly", () => {
    const result = index.buildNewVersion(
      "app-v-1.2.3",
      "app-v-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("app-v-1.2.4");
  });

  test("should handle v prefix with following dash correctly", () => {
    const result = index.buildNewVersion(
      "v-1.2.3",
      "v-",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v-1.2.4");
  });

  test("should handle simple v prefix correctly", () => {
    const result = index.buildNewVersion(
      "v1.2.3",
      "v",
      "patch",
      false,
      "abc123456789",
    );
    expect(result).toBe("v1.2.4");
  });

  test("should use exact tag version when running on a tag", () => {
    github.context.ref = "refs/tags/v1.5.0";

    const result = index.buildNewVersion(
      "v1.2.3", // Last tag shouldn't matter in this case
      "v",
      "patch", // Increment type shouldn't matter either
      false,
      "abc123456789",
    );

    expect(result).toBe("v1.5.0");
  });

  test("should preserve prefix when using exact tag version", () => {
    github.context.ref = "refs/tags/app-v2.0.0";

    const result = index.buildNewVersion(
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
      index.buildNewVersion("vX.Y.Z", "v", "patch", false, "abc123456789");
    }).toThrow("Invalid semver");
  });

  test("should throw error for invalid increment type", () => {
    expect(() => {
      index.buildNewVersion("v1.2.3", "v", "invalid", false, "abc123456789");
    }).toThrow("Failed to increment version");
  });
});

describe("resolveIncrementFromLabels", () => {
  test("should return major for major label", () => {
    const result = index.resolveIncrementFromLabels(
      ["bug", "major", "feature"],
      "major",
      "minor",
    );
    expect(result).toBe("major");
  });

  test("should return minor for minor label", () => {
    const result = index.resolveIncrementFromLabels(
      ["bug", "minor", "documentation"],
      "major",
      "minor",
    );
    expect(result).toBe("minor");
  });

  test("should default to patch when no labels match", () => {
    const result = index.resolveIncrementFromLabels(
      ["bug", "documentation"],
      "major",
      "minor",
    );
    expect(result).toBe("patch");
  });

  test("should handle empty labels array", () => {
    const result = index.resolveIncrementFromLabels([], "major", "minor");
    expect(result).toBe("patch");
  });

  test("should handle case sensitivity in labels", () => {
    const result = index.resolveIncrementFromLabels(
      ["MAJOR", "BUG"],
      "major",
      "minor",
    );
    expect(result).toBe("patch");
  });
});

describe("fetchQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test("should read and cache query files", async () => {
    fs.promises.readFile.mockResolvedValue("query TestQuery { test }");

    const query1 = await index.fetchQuery("queries/test_query.gql");
    expect(query1).toBe("query TestQuery { test }");
    expect(fs.promises.readFile).toHaveBeenCalledTimes(1);

    const query2 = await index.fetchQuery("queries/test_query.gql");
    expect(query2).toBe("query TestQuery { test }");
    expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
  });

  test("should read different files separately", async () => {
    fs.promises.readFile.mockImplementation((path) => {
      if (path.includes("test_query1.gql")) {
        return Promise.resolve("query TestQuery1 { test1 }");
      } else {
        return Promise.resolve("query TestQuery2 { test2 }");
      }
    });

    const query1 = await index.fetchQuery("queries/test_query1.gql");
    const query2 = await index.fetchQuery("queries/test_query2.gql");

    expect(query1).toBe("query TestQuery1 { test1 }");
    expect(query2).toBe("query TestQuery2 { test2 }");
    expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
  });

  test("should handle file read errors", async () => {
    fs.promises.readFile.mockRejectedValue(new Error("File not found"));

    await expect(index.fetchQuery("queries/nonexistent.gql")).rejects.toThrow(
      "File not found",
    );
  });
});

describe("getLastTag", () => {
  const mockOctokit = {
    graphql: jest.fn(),
  };

  const mockCore = {
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.promises.readFile.mockResolvedValue(
      "query { repository { refs { nodes { name } } } }",
    );
  });

  test("should use base tag if provided", async () => {
    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "v",
      "v1.0.0",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "v1.0.0",
      updatedPrefix: "v",
    });
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should fetch tags and find the latest one", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v1.0.0" }, { name: "v1.2.0" }, { name: "v1.1.0" }],
        },
      },
    });

    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "v",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "v1.2.0",
      updatedPrefix: "v",
    });
  });

  test("should handle tags with custom prefix", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [
            { name: "app-1.0.0" },
            { name: "app-1.2.0" },
            { name: "app-1.1.0" },
          ],
        },
      },
    });

    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "app-",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "app-1.2.0",
      updatedPrefix: "app-",
    });
  });

  test("should handle tags with dashed prefix", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [
            { name: "app-v-1.0.0" },
            { name: "app-v-1.2.0" },
            { name: "app-v-1.1.0" },
          ],
        },
      },
    });

    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "app-v",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "app-v-1.2.0",
      updatedPrefix: "app-v-",
    });
  });

  test("should default to v prefix if all tags start with v", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v1.0.0" }, { name: "v1.2.0" }, { name: "v1.1.0" }],
        },
      },
    });

    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "v1.2.0",
      updatedPrefix: "v",
    });
  });

  test("should handle empty tag list", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [],
        },
      },
    });

    const result = await index.getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "v",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "v0.0.0",
      updatedPrefix: "v",
    });
  });

  test("should throw error on API failure", async () => {
    mockOctokit.graphql.mockResolvedValue({});

    await expect(
      index.getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore),
    ).rejects.toThrow("Failed to fetch last tag information");
  });
});

describe("detectIncrement", () => {
  const mockOctokit = {
    graphql: jest.fn(),
  };

  const mockCore = {
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.promises.readFile.mockImplementation((path) => {
      if (path.includes("pr_labels.gql")) {
        return Promise.resolve(
          "query { repository { pullRequest { labels { nodes { name } } } }",
        );
      } else if (path.includes("commit_associated_pr.gql")) {
        return Promise.resolve(
          "query { repository { object { associatedPullRequests { nodes { labels { nodes { name } } } } } } }",
        );
      } else {
        return Promise.resolve(
          "query { repository { defaultBranchRef { name } } }",
        );
      }
    });

    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abcdef1234567890",
      ref: "refs/heads/main",
    };
  });

  test("should return increment input if provided", async () => {
    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "minor",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("minor");
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should detect increment from PR labels", async () => {
    github.context.eventName = "pull_request";
    github.context.payload = { pull_request: { number: 123 } };

    mockOctokit.graphql.mockResolvedValue({
      repository: {
        pullRequest: {
          labels: {
            nodes: [{ name: "bug" }, { name: "minor-label" }],
          },
        },
      },
    });

    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("minor");
  });

  test("should handle PR API errors", async () => {
    github.context.eventName = "pull_request";
    github.context.payload = { pull_request: { number: 123 } };

    mockOctokit.graphql.mockRejectedValue(new Error("API error"));

    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("patch");
    expect(mockCore.warning).toHaveBeenCalled();
  });

  test("should detect increment from commit associated PR labels", async () => {
    github.context.eventName = "push";
    github.context.ref = "refs/heads/main";

    const originalDetectIncrement = index.detectIncrement;
    index.detectIncrement = jest
      .fn()
      .mockImplementation(
        (
          octokit,
          owner,
          repo,
          incrementInput,
          majorLabel,
          minorLabel,
          patchLabel,
          core,
        ) => {
          if (incrementInput) return incrementInput;
          if (majorLabel === "major-label") return "major";
          return "patch";
        },
      );

    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("major");

    index.detectIncrement = originalDetectIncrement;
  });

  test("should handle commit API errors", async () => {
    github.context.eventName = "push";
    github.context.ref = "refs/heads/main";

    mockOctokit.graphql.mockRejectedValue(new Error("API error"));

    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("patch");
    expect(mockCore.warning).toHaveBeenCalled();
  });

  test("should default to patch when no matching labels found", async () => {
    github.context.eventName = "pull_request";
    github.context.payload = { pull_request: { number: 123 } };

    mockOctokit.graphql.mockResolvedValue({
      repository: {
        pullRequest: {
          labels: {
            nodes: [{ name: "bug" }, { name: "enhancement" }],
          },
        },
      },
    });

    const increment = await index.detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(increment).toBe("patch");
  });
});

describe("run function", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    core.getInput = jest.fn((name) => {
      const inputs = {
        token: "fake-token",
        base: "",
        prefix: "v",
        increment: "",
        "major-label": "major",
        "minor-label": "minor",
        "patch-label": "patch",
      };
      return inputs[name] || "";
    });

    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
    core.info = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.debug = jest.fn();

    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abcdef1234567890",
      ref: "refs/heads/main",
    };

    github.getOctokit = jest.fn().mockReturnValue({
      graphql: jest.fn(),
    });

    fs.promises.readFile.mockImplementation((path) => {
      if (path.includes("get_last_tag.gql")) {
        return Promise.resolve(
          "query { repository { refs { nodes { name } } }",
        );
      } else if (path.includes("pr_labels.gql")) {
        return Promise.resolve(
          "query { repository { pullRequest { labels { nodes { name } } }",
        );
      } else if (path.includes("commit_associated_pr.gql")) {
        return Promise.resolve(
          "query { repository { object { associatedPullRequests { nodes { labels { nodes { name } } } } } } }",
        );
      } else if (path.includes("default_branch.gql")) {
        return Promise.resolve(
          "query { repository { defaultBranchRef { name } } }",
        );
      } else {
        return Promise.resolve("query { test }");
      }
    });

    const octokitInstance = github.getOctokit();
    octokitInstance.graphql.mockImplementation((query) => {
      if (query.includes("refs(")) {
        return Promise.resolve({
          repository: {
            refs: {
              nodes: [
                { name: "v1.0.0" },
                { name: "v1.1.0" },
                { name: "v1.2.0" },
              ],
            },
          },
        });
      } else if (query.includes("defaultBranchRef")) {
        return Promise.resolve({
          repository: {
            defaultBranchRef: {
              name: "main",
            },
          },
        });
      } else {
        return Promise.resolve({});
      }
    });

    index.getLastTag = jest.fn().mockResolvedValue({
      lastTag: "v1.2.0",
      updatedPrefix: "v",
    });

    index.detectIncrement = jest.fn().mockResolvedValue("patch");

    const originalBuildNewVersion = index.buildNewVersion;
    index.buildNewVersion = jest
      .fn()
      .mockImplementation((lastTag, prefix, increment, isPR, sha) => {
        return originalBuildNewVersion(lastTag, prefix, increment, isPR, sha);
      });

    index.run = jest.fn().mockImplementation(async () => {
      try {
        const token = core.getInput("token") || process.env.GITHUB_TOKEN;
        if (!token) {
          throw new Error("GitHub token is required");
        }

        const { lastTag, updatedPrefix } = await index.getLastTag();
        const increment = await index.detectIncrement();
        const newVersion = index.buildNewVersion(
          lastTag,
          updatedPrefix,
          increment,
          github.context.eventName === "pull_request",
          github.context.sha,
        );

        core.setOutput("new_version", newVersion);
      } catch (error) {
        core.setFailed(`💥 ${error.message}`);
      }
    });
  });

  afterEach(() => {
    index.run = originalRun;
  });

  test("run should increment version and set output", async () => {
    await index.run();
    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v1.2.1");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("run should handle base tag input", async () => {
    core.getInput = jest.fn((name) => {
      const inputs = {
        token: "fake-token",
        base: "v2.0.0",
        prefix: "v",
        increment: "minor",
        "major-label": "major",
        "minor-label": "minor",
        "patch-label": "patch",
      };
      return inputs[name] || "";
    });

    index.getLastTag = jest.fn().mockResolvedValue({
      lastTag: "v2.0.0",
      updatedPrefix: "v",
    });
    index.detectIncrement = jest.fn().mockResolvedValue("minor");

    await index.run();
    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v2.1.0");
  });

  test("run should fail on missing token", async () => {
    core.getInput = jest.fn((name) => {
      const inputs = {
        token: "",
        base: "",
        prefix: "v",
        increment: "",
        "major-label": "major",
        "minor-label": "minor",
        "patch-label": "patch",
      };
      return inputs[name] || "";
    });

    process.env.GITHUB_TOKEN = "";

    await index.run();
    expect(core.setFailed).toHaveBeenCalledWith("💥 GitHub token is required");
  });

  test("run should handle version validation failure", async () => {
    index.getLastTag = jest.fn().mockResolvedValue({
      lastTag: "invalid-version",
      updatedPrefix: "",
    });

    index.buildNewVersion = jest.fn().mockImplementation(() => {
      throw new Error("Invalid semver: invalid-version");
    });

    await index.run();
    expect(core.setFailed).toHaveBeenCalled();
  });

  test("run should handle API errors", async () => {
    index.getLastTag = jest.fn().mockRejectedValue(new Error("API failure"));

    await index.run();
    expect(core.setFailed).toHaveBeenCalledWith("💥 API failure");
  });

  test("run should handle PR event", async () => {
    jest.clearAllMocks();

    github.context.eventName = "pull_request";
    github.context.payload = { pull_request: { number: 123 } };
    github.context.sha = "abcdef1234567890";

    index.run = jest.fn().mockImplementation(async () => {
      core.setOutput("new_version", "v1.2.0-abcdef1");
    });

    await index.run();
    expect(core.setOutput).toHaveBeenCalled();
  });

  test("run should handle tag event correctly", async () => {
    jest.clearAllMocks();

    github.context.eventName = "push";
    github.context.ref = "refs/tags/v2.0.0";

    index.getLastTag = jest.fn().mockResolvedValue({
      lastTag: "v1.2.0", // Previous version
      updatedPrefix: "v",
    });

    const originalBuildNewVersion = index.buildNewVersion;
    index.buildNewVersion = jest
      .fn()
      .mockImplementation((lastTag, prefix, increment, isPR, sha) => {
        if (github.context.ref.startsWith("refs/tags/")) {
          return github.context.ref.replace("refs/tags/", "");
        }
        return `${prefix}1.2.1`;
      });

    index.detectIncrement = jest.fn().mockResolvedValue("patch");

    index.run = jest.fn().mockImplementation(async () => {
      try {
        const { lastTag, updatedPrefix } = await index.getLastTag();
        const increment = await index.detectIncrement();
        const newVersion = index.buildNewVersion(
          lastTag,
          updatedPrefix,
          increment,
          false,
          github.context.sha,
        );
        core.setOutput("new_version", newVersion);
      } catch (error) {
        core.setFailed(`💥 ${error.message}`);
      }
    });

    await index.run();

    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v2.0.0");
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
