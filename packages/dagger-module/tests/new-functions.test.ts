import { expect, test, describe } from "vitest";

// ─── ensureRepository ────────────────────────────────────────────────────────
// Tested via the private helpers' logic reflected through public behaviour.
// The @func methods need a Dagger engine to run, so we unit-test the pure logic
// that was ported from the original actions.

// ─── computeSemver / inferIncrement ──────────────────────────────────────────
// We extract and re-test the label + branch inference logic directly.

type Increment = "major" | "minor" | "patch";

function inferIncrement(
  prLabelsCsv: string,
  branchName: string,
  majorLabel: string,
  minorLabel: string,
  patchLabel: string,
): Increment {
  const labels = prLabelsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (labels.includes(majorLabel)) return "major";
  if (labels.includes(minorLabel)) return "minor";
  if (labels.includes(patchLabel)) return "patch";

  const branchRules: Array<{ increment: Increment; patterns: RegExp[] }> = [
    {
      increment: "major",
      patterns: [
        /(^|[/-])(major|breaking)([/-]|$)/i,
        /(^|[/-])breaking-change([/-]|$)/i,
      ],
    },
    {
      increment: "minor",
      patterns: [/(^|[/-])(feat|feature|minor)([/-]|$)/i, /^release\/.+/i],
    },
    {
      increment: "patch",
      patterns: [
        /(^|[/-])(fix|patch|hotfix|bugfix|chore|docs|refactor|test|ci|perf)([/-]|$)/i,
      ],
    },
  ];

  for (const rule of branchRules) {
    if (rule.patterns.some((p) => p.test(branchName))) return rule.increment;
  }
  return "patch";
}

describe("inferIncrement — label-based", () => {
  test("picks major from label", () => {
    expect(inferIncrement("major", "", "major", "minor", "patch")).toBe(
      "major",
    );
  });
  test("picks minor from label", () => {
    expect(inferIncrement("minor,other", "", "major", "minor", "patch")).toBe(
      "minor",
    );
  });
  test("picks patch from label", () => {
    expect(inferIncrement("patch", "", "major", "minor", "patch")).toBe(
      "patch",
    );
  });
  test("defaults to patch when no labels match", () => {
    expect(
      inferIncrement("unrelated-label", "", "major", "minor", "patch"),
    ).toBe("patch");
  });
  test("labels take precedence over branch name", () => {
    expect(
      inferIncrement("minor", "breaking/something", "major", "minor", "patch"),
    ).toBe("minor");
  });
});

describe("inferIncrement — branch-based", () => {
  test("feat/ prefix → minor", () => {
    expect(
      inferIncrement("", "feat/new-thing", "major", "minor", "patch"),
    ).toBe("minor");
  });
  test("feature/ prefix → minor", () => {
    expect(inferIncrement("", "feature/cool", "major", "minor", "patch")).toBe(
      "minor",
    );
  });
  test("breaking/ prefix → major", () => {
    expect(inferIncrement("", "breaking/api", "major", "minor", "patch")).toBe(
      "major",
    );
  });
  test("breaking-change in name → major", () => {
    expect(
      inferIncrement("", "my-breaking-change", "major", "minor", "patch"),
    ).toBe("major");
  });
  test("fix/ prefix → patch", () => {
    expect(inferIncrement("", "fix/bug", "major", "minor", "patch")).toBe(
      "patch",
    );
  });
  test("chore/ prefix → patch", () => {
    expect(inferIncrement("", "chore/cleanup", "major", "minor", "patch")).toBe(
      "patch",
    );
  });
  test("release/ prefix → minor", () => {
    expect(inferIncrement("", "release/1.2", "major", "minor", "patch")).toBe(
      "minor",
    );
  });
  test("unmatched branch → patch default", () => {
    expect(
      inferIncrement("", "my-random-branch", "major", "minor", "patch"),
    ).toBe("patch");
  });
  test("empty branch → patch default", () => {
    expect(inferIncrement("", "", "major", "minor", "patch")).toBe("patch");
  });
});

// ─── dockerFacts / push-decision logic ───────────────────────────────────────

function resolveDockerFactsPush(input: {
  eventName: string;
  ref: string;
  defaultBranch: string;
  canaryLabel: string;
  forcePush: boolean;
  prLabelsCsv: string;
}): boolean {
  if (input.forcePush) return true;
  if (
    input.ref === `refs/heads/${input.defaultBranch}` ||
    input.ref.startsWith("refs/tags/")
  )
    return true;
  if (input.eventName === "pull_request") {
    const labels = input.prLabelsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return labels.includes(input.canaryLabel);
  }
  return false;
}

describe("dockerFacts — push decision", () => {
  const base = {
    defaultBranch: "main",
    canaryLabel: "canary",
    forcePush: false,
    prLabelsCsv: "",
  };

  test("push on default branch", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "push",
        ref: "refs/heads/main",
      }),
    ).toBe(true);
  });
  test("push on tag ref", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "push",
        ref: "refs/tags/v1.0.0",
      }),
    ).toBe(true);
  });
  test("no push on non-default branch", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "push",
        ref: "refs/heads/feature/x",
      }),
    ).toBe(false);
  });
  test("no push on PR without canary label", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "pull_request",
        ref: "refs/pull/1/merge",
      }),
    ).toBe(false);
  });
  test("push on PR with canary label", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "pull_request",
        ref: "refs/pull/1/merge",
        prLabelsCsv: "canary,other",
      }),
    ).toBe(true);
  });
  test("force push always pushes", () => {
    expect(
      resolveDockerFactsPush({
        ...base,
        eventName: "pull_request",
        ref: "refs/pull/1/merge",
        forcePush: true,
      }),
    ).toBe(true);
  });
});

// ─── enforcePrLabels ────────────────────────────────────────────────────────

function csv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function enforcePrLabelsLogic(
  labelsCsv: string,
  requiredAnyCsv: string,
  bannedCsv: string,
  requiredAnyDescription: string = "Select at least one required label",
): { pass: boolean; labels: string[]; matched: string[] } {
  const labels = csv(labelsCsv);
  const required = csv(requiredAnyCsv);
  const banned = csv(bannedCsv);

  const bannedFound = banned.filter((l) => labels.includes(l));
  if (bannedFound.length > 0) {
    throw new Error(`PR has banned label(s): ${bannedFound.join(", ")}`);
  }

  const hasRequired =
    required.length === 0 || required.some((l) => labels.includes(l));
  if (!hasRequired) {
    throw new Error(
      `${requiredAnyDescription} (required one of: ${required.join(", ")})`,
    );
  }

  const matched = required.filter((l) => labels.includes(l));
  return {
    pass: true,
    labels,
    matched,
  };
}

describe("enforcePrLabels — label validation", () => {
  test("passes with required label present", () => {
    const result = enforcePrLabelsLogic(
      "major,bug",
      "major,minor,patch",
      "",
    );
    expect(result.pass).toBe(true);
    expect(result.labels).toEqual(["major", "bug"]);
    expect(result.matched).toEqual(["major"]);
  });

  test("passes when no required labels specified", () => {
    const result = enforcePrLabelsLogic("any-label", "", "");
    expect(result.pass).toBe(true);
    expect(result.labels).toEqual(["any-label"]);
    expect(result.matched).toEqual([]);
  });

  test("fails when required label is missing", () => {
    expect(() =>
      enforcePrLabelsLogic("bug", "major,minor,patch", ""),
    ).toThrow("Select at least one required label");
  });

  test("fails with custom error message when required label missing", () => {
    expect(() =>
      enforcePrLabelsLogic(
        "bug",
        "major,minor,patch",
        "",
        "You must select a version bump",
      ),
    ).toThrow("You must select a version bump");
  });

  test("fails when banned label is present", () => {
    expect(() =>
      enforcePrLabelsLogic("bug,banned", "major,minor,patch", "banned"),
    ).toThrow("PR has banned label(s): banned");
  });

  test("fails when multiple banned labels are present", () => {
    expect(() =>
      enforcePrLabelsLogic(
        "bug,skip-ci,do-not-merge",
        "major,minor,patch",
        "skip-ci,do-not-merge",
      ),
    ).toThrow("PR has banned label(s): skip-ci, do-not-merge");
  });

  test("handles whitespace in CSV values", () => {
    const result = enforcePrLabelsLogic(
      "major , bug , docs",
      "major, minor, patch",
      "banned, skip-ci",
    );
    expect(result.labels).toEqual(["major", "bug", "docs"]);
    expect(result.matched).toEqual(["major"]);
  });

  test("empty labels pass with no required labels", () => {
    const result = enforcePrLabelsLogic("", "", "");
    expect(result.pass).toBe(true);
    expect(result.labels).toEqual([]);
    expect(result.matched).toEqual([]);
  });

  test("matches multiple required labels", () => {
    const result = enforcePrLabelsLogic(
      "major,minor,documentation",
      "major,minor,patch",
      "",
    );
    expect(result.matched).toEqual(["major", "minor"]);
  });
});

// ─── graphql variable coercion ────────────────────────────────────────────────
// Port of the coercion logic without the graphql parser (structural test only)

describe("graphql args parsing", () => {
  function parseArgs(args: string): Record<string, string> {
    const variables: Record<string, string> = {};
    if (args.trim()) {
      for (const pair of args
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          variables[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        }
      }
    }
    return variables;
  }

  test("comma-separated pairs", () => {
    expect(parseArgs("owner=mbround18, repo=gh-reusable")).toEqual({
      owner: "mbround18",
      repo: "gh-reusable",
    });
  });
  test("newline-separated pairs", () => {
    expect(parseArgs("owner=mbround18\nrepo=gh-reusable")).toEqual({
      owner: "mbround18",
      repo: "gh-reusable",
    });
  });
  test("value with = sign", () => {
    expect(parseArgs("filter=a=b")).toEqual({ filter: "a=b" });
  });
  test("empty string returns empty object", () => {
    expect(parseArgs("")).toEqual({});
  });
});
