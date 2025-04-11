const github = require("@actions/github");
const {
  resolveIncrementFromLabels,
  detectIncrement,
} = require("../src/increment");

jest.mock("../src/tag", () => ({
  fetchQuery: jest.fn().mockResolvedValue("query { test }"),
}));

describe("resolveIncrementFromLabels", () => {
  test("should return major for major label", () => {
    const result = resolveIncrementFromLabels(
      ["bug", "major", "feature"],
      "major",
      "minor",
    );
    expect(result).toBe("major");
  });

  test("should return minor for minor label", () => {
    const result = resolveIncrementFromLabels(
      ["bug", "minor", "documentation"],
      "major",
      "minor",
    );
    expect(result).toBe("minor");
  });

  test("should default to patch when no labels match", () => {
    const result = resolveIncrementFromLabels(
      ["bug", "documentation"],
      "major",
      "minor",
    );
    expect(result).toBe("patch");
  });

  test("should handle empty labels array", () => {
    const result = resolveIncrementFromLabels([], "major", "minor");
    expect(result).toBe("patch");
  });

  test("should handle case sensitivity in labels", () => {
    const result = resolveIncrementFromLabels(
      ["MAJOR", "BUG"],
      "major",
      "minor",
    );
    expect(result).toBe("patch");
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

    // Mock GitHub context
    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abcdef1234567890",
      ref: "refs/heads/main",
    };
  });

  test("should return increment input if provided", async () => {
    const increment = await detectIncrement(
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

    const increment = await detectIncrement(
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

    const increment = await detectIncrement(
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

    mockOctokit.graphql.mockResolvedValue({
      repository: {
        object: {
          associatedPullRequests: {
            nodes: [
              {
                labels: {
                  nodes: [{ name: "major-label" }],
                },
              },
            ],
          },
        },
      },
    });

    const increment = await detectIncrement(
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
  });

  test("should handle commit API errors", async () => {
    github.context.eventName = "push";
    github.context.ref = "refs/heads/main";

    mockOctokit.graphql.mockRejectedValue(new Error("API error"));

    const increment = await detectIncrement(
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

    const increment = await detectIncrement(
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
