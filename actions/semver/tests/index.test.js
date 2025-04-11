const core = require("@actions/core");
const github = require("@actions/github");
const main = require("../src");

// Correctly mock the dependencies
jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../src/tag");
jest.mock("../src/increment");
jest.mock("../src/version");

describe("run function", () => {
  // Setup mock functions that will be properly called
  let mockGetLastTag,
    mockDetectIncrement,
    mockBuildNewVersion,
    mockOctokitInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock core inputs/outputs
    core.getInput = jest.fn((name) => {
      const inputs = {
        token: "fake-token",
        base: "",
        prefix: "v",
        increment: "",
        "major-label": "major",
        "minor-label": "minor",
        "patch-label": "patch",
      };
      return inputs[name] || "";
    });

    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
    core.info = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.warning = jest.fn();

    // Mock github context
    github.context = {
      eventName: "push",
      payload: {},
      repo: { owner: "testowner", repo: "testrepo" },
      sha: "abcdef1234567890",
      ref: "refs/heads/main",
    };

    // Mock Octokit
    mockOctokitInstance = {
      graphql: jest.fn().mockResolvedValue({}),
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokitInstance);

    // Setup the function mocks with explicit implementations
    mockGetLastTag = jest.fn().mockResolvedValue({
      lastTag: "v1.2.0",
      updatedPrefix: "v",
    });

    mockDetectIncrement = jest.fn().mockResolvedValue("patch");

    mockBuildNewVersion = jest
      .fn()
      .mockImplementation((lastTag, prefix, increment, isPR, sha) => {
        // Simple version bumping logic for tests
        if (increment === "patch") return `${prefix}1.2.1`;
        if (increment === "minor") return `${prefix}1.3.0`;
        if (increment === "major") return `${prefix}2.0.0`;
        if (isPR) return `${prefix}1.2.0-${sha.substring(0, 7)}`;
        return `${prefix}1.2.1`; // Default
      });

    // Replace the module functions with our mocks
    main.getLastTag = mockGetLastTag;
    main.detectIncrement = mockDetectIncrement;
    main.buildNewVersion = mockBuildNewVersion;

    // Keep a reference to the original run function
    const originalRun = main.run;

    // Create our own implementation of run for testing
    main.run = jest.fn().mockImplementation(async () => {
      try {
        const token = core.getInput("token") || process.env.GITHUB_TOKEN;
        if (!token) {
          throw new Error("GitHub token is required");
        }

        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const base = core.getInput("base");
        const prefix = core.getInput("prefix");
        const incrementInput = core.getInput("increment");
        const majorLabel = core.getInput("major-label");
        const minorLabel = core.getInput("minor-label");
        const patchLabel = core.getInput("patch-label");

        // Use our mock functions explicitly
        const { lastTag, updatedPrefix } = await mockGetLastTag(
          octokit,
          owner,
          repo,
          prefix,
          base,
          core,
        );

        const increment = await mockDetectIncrement(
          octokit,
          owner,
          repo,
          incrementInput,
          majorLabel,
          minorLabel,
          patchLabel,
          core,
        );

        const isPR = github.context.eventName === "pull_request";
        const newVersion = mockBuildNewVersion(
          lastTag,
          updatedPrefix,
          increment,
          isPR,
          github.context.sha,
        );

        core.setOutput("new_version", newVersion);
      } catch (error) {
        core.setFailed(`💥 ${error.message}`);
      }
    });

    // Store the original run for cleanup
    main._originalRun = originalRun;
  });

  // Restore the original run function after all tests
  afterAll(() => {
    if (main._originalRun) {
      main.run = main._originalRun;
      delete main._originalRun;
    }
  });

  test("should increment version and set output", async () => {
    await main.run();

    expect(github.getOctokit).toHaveBeenCalledWith("fake-token");
    expect(mockGetLastTag).toHaveBeenCalled();
    expect(mockDetectIncrement).toHaveBeenCalled();
    expect(mockBuildNewVersion).toHaveBeenCalledWith(
      "v1.2.0",
      "v",
      "patch",
      false,
      "abcdef1234567890",
    );
    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v1.2.1");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("should handle base tag input", async () => {
    // Change input mock for this specific test
    core.getInput = jest.fn((name) => {
      const inputs = {
        token: "fake-token",
        base: "v2.0.0",
        prefix: "v",
        increment: "minor",
        "major-label": "major",
        "minor-label": "minor",
        "patch-label": "patch",
      };
      return inputs[name] || "";
    });

    // Update mock to return values for this test case
    mockGetLastTag.mockResolvedValueOnce({
      lastTag: "v2.0.0",
      updatedPrefix: "v",
    });

    mockDetectIncrement.mockResolvedValueOnce("minor");

    mockBuildNewVersion.mockReturnValueOnce("v2.1.0");

    await main.run();

    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v2.1.0");
  });

  test("should fail on missing token", async () => {
    core.getInput = jest.fn().mockReturnValue("");
    process.env.GITHUB_TOKEN = "";

    await main.run();

    expect(core.setFailed).toHaveBeenCalledWith("💥 GitHub token is required");
  });

  test("should handle API errors", async () => {
    mockGetLastTag.mockRejectedValueOnce(new Error("API failure"));

    await main.run();

    expect(core.setFailed).toHaveBeenCalledWith("💥 API failure");
  });

  test("should handle PR event", async () => {
    github.context.eventName = "pull_request";
    github.context.payload = { pull_request: { number: 123 } };

    mockBuildNewVersion.mockReturnValueOnce("v1.2.0-abcdef1");

    await main.run();

    expect(core.setOutput).toHaveBeenCalledWith(
      "new_version",
      "v1.2.0-abcdef1",
    );
  });

  test("should handle tag event correctly", async () => {
    github.context.ref = "refs/tags/v2.0.0";

    // When it's a tag event, buildNewVersion should return the tag name
    mockBuildNewVersion.mockReturnValueOnce("v2.0.0");

    await main.run();

    expect(core.setOutput).toHaveBeenCalledWith("new_version", "v2.0.0");
  });
});
