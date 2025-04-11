const core = require("@actions/core");
const github = require("@actions/github");
const parseGitHubContext = require("../src/parseGitHubContext");

jest.mock("@actions/core");
jest.mock("@actions/github");

describe("parseGitHubContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should detect default branch push", () => {
    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {
        repository: {
          default_branch: "main",
        },
      },
    };

    const result = parseGitHubContext();

    expect(result.isDefaultBranch).toBe(true);
    expect(result.branchName).toBe("main");
    expect(result.push).toBe(true);
  });

  test("should detect feature branch push", () => {
    github.context = {
      eventName: "push",
      ref: "refs/heads/feature-branch",
      payload: {
        repository: {
          default_branch: "main",
        },
      },
    };

    const result = parseGitHubContext();

    expect(result.isDefaultBranch).toBe(false);
    expect(result.branchName).toBe("feature-branch");
    expect(result.push).toBe(false);
  });

  test("should detect tag push", () => {
    github.context = {
      eventName: "push",
      ref: "refs/tags/v1.0.0",
      payload: {
        repository: {
          default_branch: "main",
        },
      },
    };

    const result = parseGitHubContext();

    expect(result.isTag).toBe(true);
    expect(result.push).toBe(true);
  });

  test("should detect PR with canary label", () => {
    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          number: 123,
          labels: [{ name: "bug" }, { name: "canary" }],
        },
        repository: {
          default_branch: "main",
        },
      },
    };

    const result = parseGitHubContext("canary");

    expect(result.isCanary).toBe(true);
    expect(result.branchName).toBe("pr-123");
    expect(result.push).toBe(true);
  });

  test("should detect force push setting", () => {
    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          number: 123,
          labels: [],
        },
        repository: {
          default_branch: "main",
        },
      },
    };

    const resultWithoutForce = parseGitHubContext("canary", false);
    expect(resultWithoutForce.push).toBe(false);

    const resultWithForce = parseGitHubContext("canary", true);
    expect(resultWithForce.push).toBe(true);
  });

  test("should handle error gracefully", () => {
    const originalContext = github.context;
    github.context = undefined;

    const result = parseGitHubContext();

    expect(result.eventName).toBe("unknown");
    expect(result.push).toBe(false);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Error parsing GitHub context"),
    );

    github.context = originalContext;
  });
});
