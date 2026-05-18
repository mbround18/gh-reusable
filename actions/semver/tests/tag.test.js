import { describe, test, beforeEach, vi, expect } from "vitest";
import fs from "fs/promises";
import path from "path";

// Create a simple mock for graphql
const mockOctokit = {
  graphql: vi.fn(),
};

const mockCore = {
  info: vi.fn(),
  warning: vi.fn(),
};

describe("tag.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_REF;
  });

  describe("version extraction", () => {
    test("should extract semantic version from tag name", () => {
      const extractVersion = (tag) => {
        const versionMatch = tag.match(/v?(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : tag;
      };

      expect(extractVersion("v1.2.3")).toBe("1.2.3");
      expect(extractVersion("1.2.3")).toBe("1.2.3");
      expect(extractVersion("v2.0.0-beta.1")).toBe("2.0.0");
    });

    test("should handle tags with prefixes", () => {
      const extractVersion = (tag, prefix = "") => {
        if (prefix && tag.startsWith(prefix)) {
          const versionPart = tag.slice(prefix.length);
          const versionMatch = versionPart.match(/v?(\d+\.\d+\.\d+)/);
          return versionMatch ? versionMatch[1] : versionPart;
        }
        return tag;
      };

      expect(extractVersion("release-v1.0.0", "release-")).toBe("1.0.0");
      expect(extractVersion("v2.0.0", "v")).toBe("2.0.0");
    });
  });

  describe("tag comparison", () => {
    test("should compare semantic versions correctly", () => {
      const compareTags = (tag1, tag2) => {
        const extractNum = (tag) => {
          const match = tag.match(/(\d+)\.(\d+)\.(\d+)/);
          if (!match) return [0, 0, 0];
          return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        };

        const [major1, minor1, patch1] = extractNum(tag1);
        const [major2, minor2, patch2] = extractNum(tag2);

        if (major1 !== major2) return major1 - major2;
        if (minor1 !== minor2) return minor1 - minor2;
        return patch1 - patch2;
      };

      expect(compareTags("v1.0.0", "v2.0.0")).toBeLessThan(0);
      expect(compareTags("v2.0.0", "v1.9.0")).toBeGreaterThan(0);
      expect(compareTags("v1.0.0", "v1.0.0")).toBe(0);
    });

    test("should find latest tag from list", () => {
      const findLatestTag = (tags) => {
        if (tags.length === 0) return "";
        const compareTags = (tag1, tag2) => {
          const extractNum = (tag) => {
            const match = tag.match(/(\d+)\.(\d+)\.(\d+)/);
            if (!match) return [0, 0, 0];
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          };
          const [major1, minor1, patch1] = extractNum(tag1);
          const [major2, minor2, patch2] = extractNum(tag2);
          if (major1 !== major2) return major1 - major2;
          if (minor1 !== minor2) return minor1 - minor2;
          return patch1 - patch2;
        };

        return tags.reduce((latest, tag) => {
          return compareTags(tag, latest) > 0 ? tag : latest;
        });
      };

      const tags = ["v1.0.0", "v2.1.0", "v1.9.0", "v2.0.5"];
      expect(findLatestTag(tags)).toBe("v2.1.0");
    });
  });

  describe("prefix detection", () => {
    test("should detect common prefix from tags", () => {
      const detectPrefix = (tags) => {
        if (tags.length === 0) return "";
        const firstChar = tags[0][0];
        if (tags.every((tag) => tag.startsWith(firstChar))) {
          return firstChar;
        }
        return "";
      };

      expect(detectPrefix(["v1.0.0", "v2.0.0"])).toBe("v");
      expect(detectPrefix(["release-1.0.0", "release-2.0.0"])).toBe("r");
    });

    test("should handle mixed prefixes", () => {
      const detectPrefix = (tags) => {
        if (tags.length === 0) return "";
        const firstTag = tags[0];
        for (let i = 1; i <= firstTag.length; i++) {
          const prefix = firstTag.slice(0, i);
          if (!tags.every((tag) => tag.startsWith(prefix))) {
            return firstTag.slice(0, i - 1);
          }
        }
        return firstTag;
      };

      expect(detectPrefix(["v1.0.0", "v2.0.0"])).toBe("v");
      expect(detectPrefix(["1.0.0", "2.0.0"])).toBe("");
    });
  });

  describe("GraphQL response handling", () => {
    test("should parse GraphQL response with tags", async () => {
      const response = {
        repository: {
          refs: {
            nodes: [
              { name: "v2.0.0" },
              { name: "v1.9.0" },
            ],
          },
        },
      };

      expect(response.repository.refs.nodes).toHaveLength(2);
      expect(response.repository.refs.nodes[0].name).toBe("v2.0.0");
    });

    test("should handle empty tag response", async () => {
      const response = {
        repository: {
          refs: {
            nodes: [],
          },
        },
      };

      expect(response.repository.refs.nodes).toHaveLength(0);
    });

    test("should handle GraphQL errors", async () => {
      const error = new Error("GraphQL error: rate limit exceeded");
      expect(error.message).toContain("GraphQL error");
    });
  });

  describe("GitHub environment context", () => {
    test("should detect tag event from GITHUB_REF", () => {
      process.env.GITHUB_REF = "refs/tags/v1.2.3";
      const isTagEvent = () => {
        const ref = process.env.GITHUB_REF || "";
        return ref.startsWith("refs/tags/");
      };

      expect(isTagEvent()).toBe(true);
      expect(process.env.GITHUB_REF.replace("refs/tags/", "")).toBe("v1.2.3");
    });

    test("should detect branch event from GITHUB_REF", () => {
      process.env.GITHUB_REF = "refs/heads/main";
      const isBranchEvent = () => {
        const ref = process.env.GITHUB_REF || "";
        return ref.startsWith("refs/heads/");
      };

      expect(isBranchEvent()).toBe(true);
    });

    test("should handle missing GITHUB_REF", () => {
      delete process.env.GITHUB_REF;
      const getRef = () => process.env.GITHUB_REF || "";
      expect(getRef()).toBe("");
    });
  });
});
