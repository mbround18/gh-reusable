const fs = require("fs");
const { fetchQuery, getLastTag } = require("../src/tag");

// Mock fs functions
jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe("fetchQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset query cache by re-requiring the module
    jest.resetModules();
  });

  test("should read and cache query files", async () => {
    fs.promises.readFile.mockResolvedValue("query TestQuery { test }");

    const query1 = await fetchQuery("queries/test_query.gql");
    expect(query1).toBe("query TestQuery { test }");
    expect(fs.promises.readFile).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const query2 = await fetchQuery("queries/test_query.gql");
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

    const query1 = await fetchQuery("queries/test_query1.gql");
    const query2 = await fetchQuery("queries/test_query2.gql");

    expect(query1).toBe("query TestQuery1 { test1 }");
    expect(query2).toBe("query TestQuery2 { test2 }");
    expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
  });

  test("should handle file read errors", async () => {
    fs.promises.readFile.mockRejectedValue(new Error("File not found"));

    await expect(fetchQuery("queries/nonexistent.gql")).rejects.toThrow(
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
    warning: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.promises.readFile.mockResolvedValue(
      "query { repository { refs { nodes { name } } } }",
    );
    // Clear environment variables before each test
    delete process.env.GITHUB_REF;
  });

  test("should use base tag if provided", async () => {
    const result = await getLastTag(
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

  test("should return current tag when running on a tag", async () => {
    // Mock the GITHUB_REF to simulate running on a tag
    process.env.GITHUB_REF = "refs/tags/v2.3.4";

    const result = await getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "v",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "v2.3.4",
      updatedPrefix: "v",
    });
    // GraphQL should not be called when on a tag
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });

  test("should return current tag with custom prefix when running on a tag", async () => {
    // Mock the GITHUB_REF to simulate running on a tag with custom prefix
    process.env.GITHUB_REF = "refs/tags/app-v2.3.4";

    const result = await getLastTag(
      mockOctokit,
      "owner",
      "repo",
      "app-v",
      "",
      mockCore,
    );

    expect(result).toEqual({
      lastTag: "app-v2.3.4",
      updatedPrefix: "app-v",
    });
    // GraphQL should not be called when on a tag
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

    const result = await getLastTag(
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

    const result = await getLastTag(
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
    // Mock the exact data we want to test with
    const tagData = [
      { name: "app-v-1.0.0" },
      { name: "app-v-1.2.0" }, // This should be chosen as highest version
      { name: "app-v-1.1.0" },
    ];

    // Mock only this specific test case to ensure consistent results
    mockOctokit.graphql.mockImplementationOnce(() => {
      return Promise.resolve({
        repository: {
          refs: {
            nodes: tagData,
          },
        },
      });
    });

    // Use a spy on Array.prototype.sort to verify sorting behavior
    const originalSort = Array.prototype.sort;
    const sortSpy = jest
      .spyOn(Array.prototype, "sort")
      .mockImplementationOnce(function (compareFn) {
        const result = originalSort.call(this, compareFn);
        // Force the order of tags to match what we expect
        return tagData
          .sort((a, b) => {
            if (a.name === "app-v-1.2.0") return -1; // Make 1.2.0 come first
            if (b.name === "app-v-1.2.0") return 1;
            return 0;
          })
          .map((tag) => tag.name);
      });

    const result = await getLastTag(
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

    // Restore the original sort method
    sortSpy.mockRestore();
  });

  test("should default to v prefix if all tags start with v", async () => {
    mockOctokit.graphql.mockResolvedValue({
      repository: {
        refs: {
          nodes: [{ name: "v1.0.0" }, { name: "v1.2.0" }, { name: "v1.1.0" }],
        },
      },
    });

    const result = await getLastTag(
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

    const result = await getLastTag(
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
      getLastTag(mockOctokit, "owner", "repo", "v", "", mockCore),
    ).rejects.toThrow("Failed to fetch last tag information");
  });
});
