const github = require("@actions/github");
const path = require("path");
const fs = require("fs");
const {
  resolveIncrementFromLabels,
  detectIncrement,
} = require("../src/increment");

// Mock GitHub context and fs
jest.mock("@actions/github", () => ({
  context: {
    eventName: "push",
    payload: {},
    repo: { owner: "testowner", repo: "testrepo" },
    sha: "abc123456789",
    ref: "refs/heads/main",
  },
}));

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe("resolveIncrementFromLabels", () => {
  test("should return patch by default with no labels", () => {
    const result = resolveIncrementFromLabels([], "major", "minor", "patch");
    expect(result).toBe("patch");
  });

  test("should return patch by default with unmatched labels", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "documentation" }, { name: "bug" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("patch");
  });

  test("should detect major label", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "documentation" }, { name: "major" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("major");
  });

  test("should detect minor label", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "documentation" }, { name: "minor" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("minor");
  });

  test("should detect patch label", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "documentation" }, { name: "patch" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("patch");
  });

  test("should prioritize major over minor and patch", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "major" }, { name: "minor" }, { name: "patch" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("major");
  });

  test("should prioritize minor over patch", () => {
    const result = resolveIncrementFromLabels(
      [{ name: "minor" }, { name: "patch" }],
      "major",
      "minor",
      "patch",
    );
    expect(result).toBe("minor");
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
    fs.promises.readFile.mockResolvedValue("query { test }");

    // Reset GitHub context
    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abc123456789",
      ref: "refs/heads/main",
    };
  });

  test("should use provided increment input", async () => {
    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "minor",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );
    expect(result).toBe("minor");
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should detect PR labels in pull_request event", async () => {
    // Set up GitHub context for PR
    github.context.eventName = "pull_request";
    github.context.payload = {
      pull_request: { number: 123 },
    };

    // Mock the GraphQL response for PR labels
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        pullRequest: {
          labels: {
            nodes: [{ name: "documentation" }, { name: "minor-label" }],
          },
        },
      },
    });

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(result).toBe("minor");
    expect(mockOctokit.graphql).toHaveBeenCalledTimes(1);
  });

  test("should handle error getting PR labels", async () => {
    // Set up GitHub context for PR
    github.context.eventName = "pull_request";
    github.context.payload = {
      pull_request: { number: 123 },
    };

    // Mock GraphQL error
    mockOctokit.graphql.mockRejectedValue(new Error("API error"));

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(result).toBe("patch");
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining("Failed to get PR labels"),
    );
  });

  test("should detect labels from commit-associated PR", async () => {
    // Set up for push event with associated PR
    github.context.eventName = "push";
    github.context.sha = "commit123";

    // Mock the GraphQL response for commit-associated PR
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        object: {
          associatedPullRequests: {
            nodes: [
              {
                title: "Test PR",
                number: 456,
                labels: {
                  nodes: [{ name: "minor-label" }],
                },
              },
            ],
          },
        },
      },
    });

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(result).toBe("minor");
    expect(mockOctokit.graphql).toHaveBeenCalledTimes(1);
    expect(mockCore.info).toHaveBeenCalledWith(
      expect.stringContaining("Found 1 associated PRs"),
    );
  });

  test("should return patch when no associated PRs found", async () => {
    // Set up for push event with no associated PR
    github.context.eventName = "push";
    github.context.sha = "commit456";

    // Mock the GraphQL response with no associated PRs
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        object: {
          associatedPullRequests: {
            nodes: [], // Empty array - no PRs
          },
        },
      },
    });

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(result).toBe("patch");
    expect(mockOctokit.graphql).toHaveBeenCalledTimes(1);
    expect(mockCore.info).toHaveBeenCalledWith(
      "No associated PRs found for this commit",
    );
  });

  test("should handle error getting associated PR labels", async () => {
    // Set up for push event
    github.context.eventName = "push";

    // Mock GraphQL error
    mockOctokit.graphql.mockRejectedValue(new Error("API error"));

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label",
      "patch-label",
      mockCore,
    );

    expect(result).toBe("patch");
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining("Failed to get associated PR labels"),
    );
  });

  test("should handle case-sensitive labels correctly", async () => {
    // Set up for push event with associated PR
    github.context.eventName = "push";

    // Mock the GraphQL response with labels that don't exactly match
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        object: {
          associatedPullRequests: {
            nodes: [
              {
                labels: {
                  nodes: [
                    { name: "Minor-label" }, // Capital M, but looking for "minor-label"
                    { name: "documentation" },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    const result = await detectIncrement(
      mockOctokit,
      "owner",
      "repo",
      "",
      "major-label",
      "minor-label", // lowercase
      "patch-label",
      mockCore,
    );

    // Should not match due to case sensitivity
    expect(result).toBe("patch");
  });
});
