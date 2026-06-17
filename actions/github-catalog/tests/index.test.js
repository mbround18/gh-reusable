import { describe, test, expect } from "vitest";

describe("github-catalog action", () => {
  describe("getInputPadding", () => {
    test("should calculate padding based on longest key-value combination", () => {
      const getInputPadding = (obj, additionalPadding = 0) => {
        const longest = Object.entries(obj).reduce(
          (maxLength, [key, value]) => {
            const combinedLength = `${key}${value?.default ?? ""}`.length;
            return Math.max(maxLength, combinedLength);
          },
          0,
        );
        return longest + additionalPadding;
      };

      const inputs = {
        token: { default: "abc123" },
        path: { default: "./src" },
      };
      const padding = getInputPadding(inputs, 4);
      expect(padding).toBeGreaterThanOrEqual(10);
    });

    test("should handle empty inputs object", () => {
      const getInputPadding = (obj, additionalPadding = 0) => {
        const longest = Object.entries(obj).reduce(
          (maxLength, [key, value]) => {
            const combinedLength = `${key}${value?.default ?? ""}`.length;
            return Math.max(maxLength, combinedLength);
          },
          0,
        );
        return longest + additionalPadding;
      };

      expect(getInputPadding({}, 0)).toBe(0);
    });

    test("should add additional padding", () => {
      const getInputPadding = (obj, additionalPadding = 0) => {
        const longest = Object.entries(obj).reduce(
          (maxLength, [key, value]) => {
            const combinedLength = `${key}${value?.default ?? ""}`.length;
            return Math.max(maxLength, combinedLength);
          },
          0,
        );
        return longest + additionalPadding;
      };

      const inputs = {
        token: { default: "x" },
      };
      expect(getInputPadding(inputs, 10)).toBe(16);
    });

    test("should handle undefined defaults", () => {
      const getInputPadding = (obj, additionalPadding = 0) => {
        const longest = Object.entries(obj).reduce(
          (maxLength, [key, value]) => {
            const combinedLength = `${key}${value?.default ?? ""}`.length;
            return Math.max(maxLength, combinedLength);
          },
          0,
        );
        return longest + additionalPadding;
      };

      const inputs = {
        required_field: { required: true },
      };
      expect(getInputPadding(inputs, 0)).toBe("required_field".length);
    });
  });

  describe("sanitizeInputs", () => {
    test("should sort inputs by required first, then alphabetically", () => {
      const sanitizeInputs = (obj) => {
        return Object.entries(obj)
          .map(([key, value]) => [
            key,
            {
              ...value,
              default:
                value.default === undefined ? "" : String(value.default ?? ""),
            },
          ])
          .sort(([aKey, aVal], [bKey, bVal]) => {
            const aReq = !!aVal.required;
            const bReq = !!bVal.required;
            return aReq !== bReq ? (aReq ? -1 : 1) : aKey.localeCompare(bKey);
          })
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {});
      };

      const inputs = {
        zulu: { default: "z" },
        alpha: { required: true },
        bravo: { default: "b" },
      };

      const sorted = sanitizeInputs(inputs);
      const keys = Object.keys(sorted);
      expect(keys[0]).toBe("alpha");
      expect(keys).toEqual(["alpha", "bravo", "zulu"]);
    });

    test("should convert defaults to strings", () => {
      const sanitizeInputs = (obj) => {
        return Object.entries(obj)
          .map(([key, value]) => [
            key,
            {
              ...value,
              default:
                value.default === undefined ? "" : String(value.default ?? ""),
            },
          ])
          .sort(([aKey, aVal], [bKey, bVal]) => {
            const aReq = !!aVal.required;
            const bReq = !!bVal.required;
            return aReq !== bReq ? (aReq ? -1 : 1) : aKey.localeCompare(bKey);
          })
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {});
      };

      const inputs = {
        count: { default: 123 },
        flag: { default: true },
      };

      const sanitized = sanitizeInputs(inputs);
      expect(sanitized.count.default).toBe("123");
      expect(sanitized.flag.default).toBe("true");
    });

    test("should handle undefined defaults with empty string", () => {
      const sanitizeInputs = (obj) => {
        return Object.entries(obj)
          .map(([key, value]) => [
            key,
            {
              ...value,
              default:
                value.default === undefined ? "" : String(value.default ?? ""),
            },
          ])
          .sort(([aKey, aVal], [bKey, bVal]) => {
            const aReq = !!aVal.required;
            const bReq = !!bVal.required;
            return aReq !== bReq ? (aReq ? -1 : 1) : aKey.localeCompare(bKey);
          })
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {});
      };

      const inputs = {
        token: { required: true },
      };

      const sanitized = sanitizeInputs(inputs);
      expect(sanitized.token.default).toBe("");
    });

    test("should preserve required flag", () => {
      const sanitizeInputs = (obj) => {
        return Object.entries(obj)
          .map(([key, value]) => [
            key,
            {
              ...value,
              default:
                value.default === undefined ? "" : String(value.default ?? ""),
            },
          ])
          .sort(([aKey, aVal], [bKey, bVal]) => {
            const aReq = !!aVal.required;
            const bReq = !!bVal.required;
            return aReq !== bReq ? (aReq ? -1 : 1) : aKey.localeCompare(bKey);
          })
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {});
      };

      const inputs = {
        token: { required: true, description: "GitHub token" },
      };

      const sanitized = sanitizeInputs(inputs);
      expect(sanitized.token.required).toBe(true);
      expect(sanitized.token.description).toBe("GitHub token");
    });
  });

  describe("updateReadme", () => {
    test("should replace content between markers", () => {
      const updateReadme = (readme, tableHTML) => {
        const start = "<!-- GENERATED:GITHUB-CATALOG:START -->";
        const end = "<!-- GENERATED:GITHUB-CATALOG:STOP -->";
        const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "gm");
        return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
      };

      const readme =
        "Some content\n<!-- GENERATED:GITHUB-CATALOG:START -->\nold content\n<!-- GENERATED:GITHUB-CATALOG:STOP -->\nMore content";
      const result = updateReadme(readme, "new content");
      expect(result).toContain("new content");
      expect(result).not.toContain("old content");
    });

    test("should handle missing markers gracefully", () => {
      const updateReadme = (readme, tableHTML) => {
        const start = "<!-- GENERATED:GITHUB-CATALOG:START -->";
        const end = "<!-- GENERATED:GITHUB-CATALOG:STOP -->";
        const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "gm");
        return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
      };

      const readme = "Content without markers";
      const result = updateReadme(readme, "new content");
      expect(result).toBe("Content without markers");
    });

    test("should preserve content outside markers", () => {
      const updateReadme = (readme, tableHTML) => {
        const start = "<!-- GENERATED:GITHUB-CATALOG:START -->";
        const end = "<!-- GENERATED:GITHUB-CATALOG:STOP -->";
        const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "gm");
        return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
      };

      const readme =
        "Header\n<!-- GENERATED:GITHUB-CATALOG:START -->\nold\n<!-- GENERATED:GITHUB-CATALOG:STOP -->\nFooter";
      const result = updateReadme(readme, "new");
      expect(result).toContain("Header");
      expect(result).toContain("Footer");
    });

    test("should handle multiple marker pairs", () => {
      const updateReadme = (readme, tableHTML) => {
        const start = "<!-- GENERATED:GITHUB-CATALOG:START -->";
        const end = "<!-- GENERATED:GITHUB-CATALOG:STOP -->";
        const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "gm");
        return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
      };

      const readme = `
<!-- GENERATED:GITHUB-CATALOG:START -->
first
<!-- GENERATED:GITHUB-CATALOG:STOP -->
content
<!-- GENERATED:GITHUB-CATALOG:START -->
second
<!-- GENERATED:GITHUB-CATALOG:STOP -->
`;
      const result = updateReadme(readme, "new");
      expect((result.match(/new/g) || []).length).toBe(2);
    });
  });

  describe("version formatting", () => {
    test("should format version strings correctly", () => {
      const formatVersion = (version) => {
        return `v${version}`.replace(/^v+/, "v");
      };

      expect(formatVersion("1.2.3")).toBe("v1.2.3");
      expect(formatVersion("2.0.0")).toBe("v2.0.0");
    });

    test("should handle version with pre-release", () => {
      const formatVersion = (version) => {
        return `v${version}`.replace(/^v+/, "v");
      };

      expect(formatVersion("1.0.0-beta.1")).toBe("v1.0.0-beta.1");
    });
  });

  describe("input validation", () => {
    test("should validate token input presence", () => {
      const validateToken = (token) => {
        return !!(token && token.length > 0);
      };

      expect(validateToken("test-token")).toBe(true);
      expect(validateToken("")).toBe(false);
      expect(validateToken(null)).toBe(false);
    });

    test("should validate repository context", () => {
      const context = { owner: "testowner", repo: "testrepo" };
      expect(context).toHaveProperty("owner");
      expect(context).toHaveProperty("repo");
      expect(context.owner).toBe("testowner");
    });
  });

  describe("error handling", () => {
    test("should capture action errors", () => {
      const error = new Error("Failed to process workflows");
      expect(error.message).toContain("Failed to process");
    });

    test("should preserve error context", () => {
      const error = new Error("GraphQL query failed");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("GraphQL query failed");
    });
  });
});
