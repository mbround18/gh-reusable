import { describe, test, beforeEach, vi, expect } from "vitest";

const mockReadFile = vi.fn();

vi.mock("fs", () => ({
  promises: {
    readFile: mockReadFile,
  },
}));

const fs = require("fs");
const { fetchQuery, getLastTag } = require("../src/tag");

describe("fetchQuery", () => {
  beforeEach(() => {
    mockReadFile.mockClear();
  });

  test("should read and cache query files", async () => {
    mockReadFile.mockResolvedValue("query TestQuery { test }");

    const query1 = await fetchQuery("queries/test_query.gql");
    expect(query1).toBe("query TestQuery { test }");
    expect(mockReadFile).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const query2 = await fetchQuery("queries/test_query.gql");
    expect(query2).toBe("query TestQuery { test }");
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  test("should read different files separately", async () => {
    mockReadFile.mockImplementation((path) => {
      if (path.includes("test_query1.gql")) {
        return Promise.resolve("query TestQuery1 { test1 }");
      } else {
        return Promise.resolve("query TestQuery2 { test2 }");
      }
    });

    const query1 = await fetchQuery("queries/test_query1.gql");
    const query2 = await fetchQuery("queries/test_query2.gql");

    expect(query1).toBe("query TestQuery1 { test1 }");
    expect(query2).toBe("query TestQuery2 { test2 }");
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  test("should handle file read errors", async () => {
    mockReadFile.mockRejectedValue(new Error("File not found"));

    await expect(fetchQuery("queries/nonexistent.gql")).rejects.toThrow(
      "File not found",
    );
  });
});

describe("getLastTag", () => {
  const mockOctokit = {
    graphql: vi.fn(),
  };

  const mockCore = {
    startGroup: vi.fn(),
    endGroup: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(() => {
    mockReadFile.mockClear();
    mockOctokit.graphql.mockClear();
    mockReadFile.mockResolvedValue(
      "query { repository { refs { nodes { name } } } }",
    );
    delete process.env.GITHUB_REF;
  });

  test("should use base tag if provided", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v2.0.0" }, { name: "v1.5.0" }, { name: "v1.0.0" }],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "v", "v2", mockCore);
    expect(result).toEqual({ lastTag: "v2", updatedPrefix: "v" });
  });

  test("should return current tag when running on a tag", async () => {
    process.env.GITHUB_REF = "refs/tags/v1.2.3";

    const result = await getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore);
    expect(result).toEqual({ lastTag: "v1.2.3", updatedPrefix: "v" });
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should return current tag with custom prefix when running on a tag", async () => {
    process.env.GITHUB_REF = "refs/tags/release-2.0.0";

    const result = await getLastTag(mockOctokit, "owner", "repo", "release-", "", mockCore);
    expect(result).toEqual({ lastTag: "release-2.0.0", updatedPrefix: "release-" });
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should fetch tags and find the latest one", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v3.0.0" }, { name: "v2.1.0" }, { name: "v1.0.0" }],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore);
    expect(result).toEqual({ lastTag: "v3.0.0", updatedPrefix: "v" });
    expect(mockOctokit.graphql).toHaveBeenCalled();
  });

  test("should handle tags with custom prefix", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [
            { name: "release-3.0.0" },
            { name: "release-2.1.0" },
            { name: "release-1.0.0" },
          ],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "release-", "", mockCore);
    expect(result).toEqual({ lastTag: "release-3.0.0", updatedPrefix: "release-" });
  });

  test("should handle tags with dashed prefix", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [
            { name: "app-v3.0.0" },
            { name: "app-v2.1.0" },
            { name: "app-v1.0.0" },
          ],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "app-v", "", mockCore);
    expect(result).toEqual({ lastTag: "app-v3.0.0", updatedPrefix: "app-v" });
  });

  test("should ignore non-semver tags when resolving latest tag", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [
            { name: "v2.1.0" },
            { name: "latest" },
            { name: "v1.0.0" },
            { name: "main" },
          ],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore);
    expect(result).toEqual({ lastTag: "v2.1.0", updatedPrefix: "v" });
  });

  test("should default to v prefix if all tags start with v", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v3.0.0" }, { name: "v2.1.0" }, { name: "v1.0.0" }],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "", "", mockCore);
    expect(result.updatedPrefix).toBe("v");
  });

  test("should handle empty tag list", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore);
    expect(result).toEqual({ lastTag: "v0.0.0", updatedPrefix: "v" });
  });

  test("should throw error on API failure", async () => {
    mockOctokit.graphql.mockRejectedValue(new Error("API Error"));

    await expect(
      getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore),
    ).rejects.toThrow("API Error");
  });

  test("should use empty prefix when explicitly provided", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "3.0.0" }, { name: "2.1.0" }, { name: "1.0.0" }],
        },
      },
    });

    const result = await getLastTag(mockOctokit, "owner", "repo", "", "", mockCore);
    expect(result).toEqual({ lastTag: "3.0.0", updatedPrefix: "" });
  });
});
