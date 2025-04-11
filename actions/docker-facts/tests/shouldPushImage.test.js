const core = require("@actions/core");
const github = require("@actions/github");

jest.mock("@actions/core");
jest.mock("@actions/github");

const { __testables } = require("../index");
const { shouldPushImage } = __testables || {};

describe("shouldPushImage function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
  });

  test("should push on default branch", () => {
    if (!shouldPushImage) return;

    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: { repository: { default_branch: "main" } },
    };

    const result = shouldPushImage("canary", false);

    expect(result).toBe(true);
  });

  test("should push on tag", () => {
    if (!shouldPushImage) return;

    github.context = {
      eventName: "push",
      ref: "refs/tags/v1.0.0",
      payload: {},
    };

    const result = shouldPushImage("canary", false);

    expect(result).toBe(true);
  });

  test("should push PR with canary label", () => {
    if (!shouldPushImage) return;

    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          labels: [{ name: "canary" }],
        },
      },
    };

    const result = shouldPushImage("canary", false);

    expect(result).toBe(true);
  });

  test("should not push PR without canary label", () => {
    if (!shouldPushImage) return;

    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          labels: [{ name: "bug" }],
        },
      },
    };

    const result = shouldPushImage("canary", false);

    expect(result).toBe(false);
  });

  test("should respect forcePush", () => {
    if (!shouldPushImage) return;

    github.context = {
      eventName: "pull_request",
      ref: "refs/pull/123/merge",
      payload: {
        pull_request: {
          labels: [],
        },
      },
    };

    const result = shouldPushImage("canary", true);

    expect(result).toBe(true);
  });
});
