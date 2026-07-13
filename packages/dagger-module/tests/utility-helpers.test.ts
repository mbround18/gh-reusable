import { describe, expect, test } from "vitest";

// ─── Pure-logic mirrors ───────────────────────────────────────────────────────
// Mirror private helper methods from the GhReusable Dagger module so they can
// be unit-tested without spinning up a Dagger engine.

// ─── slugify ─────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "step"
  );
}

describe("slugify", () => {
  test("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Cargo Check")).toBe("cargo-check");
  });
  test("collapses multiple special chars into one hyphen", () => {
    expect(slugify("cargo  --  publish")).toBe("cargo-publish");
  });
  test("strips leading and trailing hyphens", () => {
    expect(slugify("--foo--")).toBe("foo");
  });
  test("returns 'step' for empty string", () => {
    expect(slugify("")).toBe("step");
  });
  test("returns 'step' for string of only special chars", () => {
    expect(slugify("!@#$%")).toBe("step");
  });
  test("preserves numbers", () => {
    expect(slugify("run step 42")).toBe("run-step-42");
  });
  test("handles already-slug value unchanged", () => {
    expect(slugify("cargo-build")).toBe("cargo-build");
  });
  test("handles slash-separated command", () => {
    expect(slugify("npm/install")).toBe("npm-install");
  });
});

// ─── ociRegistryHost ─────────────────────────────────────────────────────────

function ociRegistryHost(registry: string): string {
  const normalized = registry.startsWith("oci://")
    ? registry
    : `oci://${registry}`;
  return new URL(normalized).host;
}

describe("ociRegistryHost", () => {
  test("extracts host from bare domain", () => {
    expect(ociRegistryHost("registry-1.docker.io/helm-charts")).toBe(
      "registry-1.docker.io",
    );
  });
  test("extracts host from oci:// URL", () => {
    expect(ociRegistryHost("oci://registry-1.docker.io/helm-charts")).toBe(
      "registry-1.docker.io",
    );
  });
  test("extracts host from ghcr.io", () => {
    expect(ociRegistryHost("ghcr.io/org/charts")).toBe("ghcr.io");
  });
  test("does not double-wrap oci:// prefix", () => {
    expect(ociRegistryHost("oci://my-registry.example.com/path")).toBe(
      "my-registry.example.com",
    );
  });
  test("handles registry with port", () => {
    expect(ociRegistryHost("localhost:5000/charts")).toBe("localhost:5000");
  });
});

// ─── sanitizeTagPart ─────────────────────────────────────────────────────────

function sanitizeTagPart(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "branch";
}

describe("sanitizeTagPart", () => {
  test("lowercases and replaces slashes with hyphens", () => {
    expect(sanitizeTagPart("feat/MY-Feature")).toBe("feat-my-feature");
  });
  test("allows dots, hyphens, and underscores", () => {
    expect(sanitizeTagPart("v1.0.0-beta_1")).toBe("v1.0.0-beta_1");
  });
  test("strips leading/trailing hyphens", () => {
    expect(sanitizeTagPart("/feature/")).toBe("feature");
  });
  test("returns 'branch' for empty string", () => {
    expect(sanitizeTagPart("")).toBe("branch");
  });
  test("returns 'branch' for all-special-char string", () => {
    expect(sanitizeTagPart("!@#$")).toBe("branch");
  });
  test("collapses multiple invalid chars into one hyphen", () => {
    expect(sanitizeTagPart("a  b")).toBe("a-b");
  });
  test("handles semver-like string cleanly", () => {
    expect(sanitizeTagPart("1.2.3")).toBe("1.2.3");
  });
});

// ─── imagePathWithoutRegistry ────────────────────────────────────────────────

function imagePathWithoutRegistry(image: string): string {
  const normalized = image
    .replace(/^docker\.io\//, "")
    .replace(/^ghcr\.io\//, "");
  const segments = normalized.split("/");
  if (segments.length === 0) return normalized;
  const first = segments[0];
  if (
    (first ?? "").includes(".") ||
    (first ?? "").includes(":") ||
    first === "localhost"
  ) {
    return segments.slice(1).join("/");
  }
  return normalized;
}

describe("imagePathWithoutRegistry", () => {
  test("strips docker.io prefix", () => {
    expect(imagePathWithoutRegistry("docker.io/org/app")).toBe("org/app");
  });
  test("strips ghcr.io prefix", () => {
    expect(imagePathWithoutRegistry("ghcr.io/org/app")).toBe("org/app");
  });
  test("strips custom registry with dot in hostname", () => {
    expect(imagePathWithoutRegistry("registry.example.com/org/app")).toBe(
      "org/app",
    );
  });
  test("strips localhost registry", () => {
    expect(imagePathWithoutRegistry("localhost/org/app")).toBe("org/app");
  });
  test("strips registry with port (colon in first segment)", () => {
    expect(imagePathWithoutRegistry("localhost:5000/org/app")).toBe("org/app");
  });
  test("keeps plain image name without registry", () => {
    expect(imagePathWithoutRegistry("org/app")).toBe("org/app");
  });
  test("keeps plain image name with no path separator", () => {
    expect(imagePathWithoutRegistry("app")).toBe("app");
  });
});

// ─── stripDockerRegistry ─────────────────────────────────────────────────────

function stripDockerRegistry(image: string): string {
  if (!image.includes("/")) return image;
  const parts = image.split("/");
  const first = parts[0] ?? "";
  if (
    first.includes(".") ||
    first === "localhost" ||
    first === "ghcr" ||
    first === "docker"
  ) {
    return parts.slice(1).join("/");
  }
  return image;
}

describe("stripDockerRegistry", () => {
  test("returns plain image unchanged when no slash", () => {
    expect(stripDockerRegistry("nginx")).toBe("nginx");
  });
  test("strips hostname-like prefix with dot", () => {
    expect(stripDockerRegistry("registry.example.com/org/app")).toBe(
      "org/app",
    );
  });
  test("strips localhost prefix", () => {
    expect(stripDockerRegistry("localhost/app")).toBe("app");
  });
  test("strips ghcr shorthand prefix", () => {
    expect(stripDockerRegistry("ghcr/org/app")).toBe("org/app");
  });
  test("strips docker shorthand prefix", () => {
    expect(stripDockerRegistry("docker/org/app")).toBe("org/app");
  });
  test("keeps org/image when first segment has no dot/keyword", () => {
    expect(stripDockerRegistry("org/app")).toBe("org/app");
  });
});

// ─── isPreRelease ────────────────────────────────────────────────────────────

function isPreRelease(version: string): boolean {
  return ["alpha", "beta", "rc", "dev"].some((token) =>
    version.includes(token),
  );
}

describe("isPreRelease", () => {
  test("detects alpha token", () => {
    expect(isPreRelease("1.0.0-alpha.1")).toBe(true);
  });
  test("detects beta token", () => {
    expect(isPreRelease("1.0.0-beta.3")).toBe(true);
  });
  test("detects rc token", () => {
    expect(isPreRelease("2.0.0-rc.1")).toBe(true);
  });
  test("detects dev token", () => {
    expect(isPreRelease("0.1.0-dev")).toBe(true);
  });
  test("returns false for stable release", () => {
    expect(isPreRelease("1.2.3")).toBe(false);
  });
  test("returns false for version with unrelated words", () => {
    expect(isPreRelease("1.0.0-preview")).toBe(false);
  });
  test("detects token embedded in version string (no separator)", () => {
    expect(isPreRelease("1.0.0alpha")).toBe(true);
  });
});

// ─── withVersioning ──────────────────────────────────────────────────────────

function withVersioning(manifestVersion: string, requestedVersion: string): string {
  return requestedVersion || manifestVersion;
}

describe("withVersioning", () => {
  test("returns requestedVersion when provided", () => {
    expect(withVersioning("1.0.0", "2.0.0")).toBe("2.0.0");
  });
  test("falls back to manifestVersion when requestedVersion is empty", () => {
    expect(withVersioning("1.0.0", "")).toBe("1.0.0");
  });
  test("falls back when requestedVersion is undefined-coerced empty string", () => {
    expect(withVersioning("1.5.0", "")).toBe("1.5.0");
  });
  test("returns requestedVersion even when it looks like semver", () => {
    expect(withVersioning("0.0.1", "3.14.0")).toBe("3.14.0");
  });
});

// ─── normalizeIncrement ──────────────────────────────────────────────────────

type SemverIncrement = "major" | "minor" | "patch";

function normalizeIncrement(value: string): SemverIncrement {
  if (value === "major" || value === "minor" || value === "patch") return value;
  return "patch";
}

describe("normalizeIncrement", () => {
  test("returns major for 'major'", () => {
    expect(normalizeIncrement("major")).toBe("major");
  });
  test("returns minor for 'minor'", () => {
    expect(normalizeIncrement("minor")).toBe("minor");
  });
  test("returns patch for 'patch'", () => {
    expect(normalizeIncrement("patch")).toBe("patch");
  });
  test("defaults to patch for empty string", () => {
    expect(normalizeIncrement("")).toBe("patch");
  });
  test("defaults to patch for unknown value", () => {
    expect(normalizeIncrement("breaking")).toBe("patch");
  });
  test("defaults to patch for uppercase 'MAJOR'", () => {
    expect(normalizeIncrement("MAJOR")).toBe("patch");
  });
});

// ─── labelsContain ───────────────────────────────────────────────────────────

function csv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function labelsContain(labelsCsv: string, label: string): boolean {
  return csv(labelsCsv).some((entry) => entry === label);
}

describe("labelsContain", () => {
  test("finds label in single-item CSV", () => {
    expect(labelsContain("major", "major")).toBe(true);
  });
  test("finds label in multi-item CSV", () => {
    expect(labelsContain("bug,major,docs", "major")).toBe(true);
  });
  test("returns false when label absent", () => {
    expect(labelsContain("bug,docs", "major")).toBe(false);
  });
  test("does not do partial matches", () => {
    expect(labelsContain("major-change,docs", "major")).toBe(false);
  });
  test("handles whitespace around entries", () => {
    expect(labelsContain("bug , major , docs", "major")).toBe(true);
  });
  test("returns false for empty CSV", () => {
    expect(labelsContain("", "major")).toBe(false);
  });
});

// ─── splitCsv ────────────────────────────────────────────────────────────────
// splitCsv handles both comma-separated AND whitespace-separated values;
// csv() only handles comma-separated.

function splitCsv(value: string): string[] {
  return value
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe("splitCsv", () => {
  test("splits on commas", () => {
    expect(splitCsv("a,b,c")).toEqual(["a", "b", "c"]);
  });
  test("splits on spaces", () => {
    expect(splitCsv("a b c")).toEqual(["a", "b", "c"]);
  });
  test("splits on mixed commas and spaces", () => {
    expect(splitCsv("a, b,c d")).toEqual(["a", "b", "c", "d"]);
  });
  test("handles newlines", () => {
    expect(splitCsv("a\nb\nc")).toEqual(["a", "b", "c"]);
  });
  test("returns empty array for empty string", () => {
    expect(splitCsv("")).toEqual([]);
  });
  test("collapses multiple delimiters", () => {
    expect(splitCsv("a,,b  ,  c")).toEqual(["a", "b", "c"]);
  });
});

describe("csv (comma-only)", () => {
  test("splits on commas", () => {
    expect(csv("a,b,c")).toEqual(["a", "b", "c"]);
  });
  test("does NOT split on spaces", () => {
    expect(csv("a b")).toEqual(["a b"]);
  });
  test("trims whitespace around entries", () => {
    expect(csv("a , b , c")).toEqual(["a", "b", "c"]);
  });
  test("filters empty entries from trailing comma", () => {
    expect(csv("a,b,")).toEqual(["a", "b"]);
  });
  test("returns empty array for blank string", () => {
    expect(csv("")).toEqual([]);
  });
});

// ─── countFromObjectArrayField ───────────────────────────────────────────────

function countFromObjectArrayField(rawJson: string, field: string): number {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  const value = parsed[field];
  if (!Array.isArray(value)) {
    throw new Error(`Expected JSON field "${field}" to be an array.`);
  }
  return value.length;
}

describe("countFromObjectArrayField", () => {
  test("counts items in the target field", () => {
    expect(
      countFromObjectArrayField(JSON.stringify({ findings: [1, 2, 3] }), "findings"),
    ).toBe(3);
  });
  test("returns 0 for empty array", () => {
    expect(
      countFromObjectArrayField(JSON.stringify({ items: [] }), "items"),
    ).toBe(0);
  });
  test("throws when field is not an array", () => {
    expect(() =>
      countFromObjectArrayField(JSON.stringify({ count: 5 }), "count"),
    ).toThrow('Expected JSON field "count" to be an array.');
  });
  test("throws when field is missing", () => {
    expect(() =>
      countFromObjectArrayField(JSON.stringify({}), "missing"),
    ).toThrow('Expected JSON field "missing" to be an array.');
  });
  test("throws on invalid JSON", () => {
    expect(() => countFromObjectArrayField("not json", "field")).toThrow();
  });
});

// ─── countFromArray ───────────────────────────────────────────────────────────

function countFromArray(rawJson: string): number {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON payload to be an array.");
  }
  return parsed.length;
}

describe("countFromArray", () => {
  test("counts items in a JSON array", () => {
    expect(countFromArray(JSON.stringify([1, 2, 3]))).toBe(3);
  });
  test("returns 0 for empty array", () => {
    expect(countFromArray("[]")).toBe(0);
  });
  test("throws when JSON is an object not an array", () => {
    expect(() => countFromArray(JSON.stringify({ key: [] }))).toThrow(
      "Expected JSON payload to be an array.",
    );
  });
  test("throws on invalid JSON", () => {
    expect(() => countFromArray("not-json")).toThrow();
  });
});

// ─── extractNpmPackArtifact ───────────────────────────────────────────────────

function extractNpmPackArtifact(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as Array<{ filename?: string }>;
    return parsed[0]?.filename;
  } catch {
    return undefined;
  }
}

describe("extractNpmPackArtifact", () => {
  test("returns filename from first item", () => {
    expect(
      extractNpmPackArtifact(JSON.stringify([{ filename: "pkg-1.0.0.tgz" }])),
    ).toBe("pkg-1.0.0.tgz");
  });
  test("returns undefined for empty array", () => {
    expect(extractNpmPackArtifact("[]")).toBeUndefined();
  });
  test("returns undefined for item without filename", () => {
    expect(extractNpmPackArtifact(JSON.stringify([{ size: 1234 }]))).toBeUndefined();
  });
  test("returns undefined for invalid JSON", () => {
    expect(extractNpmPackArtifact("not json")).toBeUndefined();
  });
  test("returns undefined for non-array JSON", () => {
    expect(extractNpmPackArtifact(JSON.stringify({ filename: "x.tgz" }))).toBeUndefined();
  });
  test("uses only the first element when multiple items present", () => {
    const input = JSON.stringify([
      { filename: "first-1.0.0.tgz" },
      { filename: "second-2.0.0.tgz" },
    ]);
    expect(extractNpmPackArtifact(input)).toBe("first-1.0.0.tgz");
  });
});
