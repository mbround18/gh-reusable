const core = require("@actions/core");
const github = require("@actions/github");
const path = require("path");
const yaml = require("js-yaml");

// Mock core and github modules
jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("path");
jest.mock("js-yaml");
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  constants: {
    O_RDONLY: 0,
    F_OK: 0,
  },
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
  },
}));

// Mock resolveDockerContext function
jest.mock("../src/resolveDockerContext", () => jest.fn());

// Mock process.chdir to avoid actual directory changes
const originalChdir = process.chdir;
process.chdir = jest.fn();

// Import modules after mocking
const fs = require("fs");
const resolveDockerContext = require("../src/resolveDockerContext");
const { run } = require("../index");

describe("Main run function", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Standard core mocks
    core.getInput = jest.fn();
    core.setOutput = jest.fn();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.exportVariable = jest.fn();
    core.setFailed = jest.fn();

    // Setup GitHub context
    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {
        repository: { default_branch: "main" },
      },
    };
  });

  afterAll(() => {
    // Restore process.chdir
    process.chdir = originalChdir;
  });

  test("should correctly process inputs and set outputs", async () => {
    // Define standard input values
    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: "1.2.3",
        registries: "ghcr.io,docker.io",
        dockerfile: "Dockerfile",
        context: "./src",
        canary_label: "preview",
        force_push: "false",
      };
      return inputs[name] || "";
    });

    // Mock resolveDockerContext to return the values from docker-compose
    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile.prod",
      context: "./app",
    });

    // Run main function
    await run();

    // Verify outputs
    expect(core.setOutput).toHaveBeenCalledWith(
      "dockerfile",
      "Dockerfile.prod",
    );
    expect(core.setOutput).toHaveBeenCalledWith("context", "./app");
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.stringContaining("myapp:1.2.3"),
    );
    expect(core.setOutput).toHaveBeenCalledWith("push", expect.any(String));
  });

  test("should handle errors gracefully", async () => {
    // Force an error in core.getInput
    core.getInput = jest.fn().mockImplementation(() => {
      throw new Error("Test error");
    });

    // Run function
    await run();

    // Verify error handling was triggered
    expect(core.setFailed).toHaveBeenCalledWith("Action failed: Test error");
  });

  test("should handle errors in GitHub context", async () => {
    // Setup valid inputs
    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: "1.0.0",
        registries: "",
        dockerfile: "Dockerfile",
        context: ".",
        canary_label: "canary",
        force_push: "false",
      };
      return inputs[name] || "";
    });

    // Mock resolveDockerContext
    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: ".",
    });

    // Force an error by making github.context.ref throw
    Object.defineProperty(github.context, "ref", {
      get: function () {
        throw new Error("Cannot read properties of undefined");
      },
    });

    // Run function
    await run();

    // Verify the error is caught with a proper message in warning
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Error parsing GitHub context: Cannot read properties of undefined",
      ),
    );

    // Function should still complete without failing
    expect(core.setOutput).toHaveBeenCalledWith("tags", expect.any(String));
  });

  const registries = ["docker.io", "ghcr.io"];

  // Version variants now defined as an object with descriptive keys
  const versionVariants = {
    standard: {
      version: "1.0.0",
      expectedTags: ["myapp:1.0.0", "myapp:latest", "myapp:1.0", "myapp:1"],
      description: "standard semver",
    },
    initialDev: {
      version: "0.0.1",
      expectedTags: ["myapp:0.0.1", "myapp:latest"],
      description: "initial development version",
    },
    earlyMinor: {
      version: "0.1.0",
      expectedTags: ["myapp:0.1.0", "myapp:latest"],
      description: "early minor semver",
    },
    vPrefixedSemver: {
      version: "v1.1.1",
      expectedTags: ["myapp:v1.1.1", "myapp:latest", "myapp:v1.1", "myapp:v1"],
      description: "v-prefixed semver",
    },
    vStandard: {
      version: "v1.0.0",
      expectedTags: ["myapp:v1.0.0", "myapp:latest", "myapp:v1.0", "myapp:v1"],
      description: "v-prefixed standard semver",
    },
    vInitialDev: {
      version: "v0.0.1",
      expectedTags: ["myapp:v0.0.1", "myapp:latest"],
      description: "v-prefixed initial development",
    },
    vEarlyMinor: {
      version: "v0.1.0",
      expectedTags: ["myapp:v0.1.0", "myapp:latest"],
      description: "v-prefixed early minor semver",
    },
    betaRelease: {
      version: "1.0.0-beta",
      expectedTags: ["myapp:1.0.0-beta"],
      description: "beta pre-release",
    },
    complexBeta: {
      version: "v1.0.0-beta.1",
      expectedTags: ["myapp:v1.0.0-beta.1"],
      description: "complex beta pre-release",
    },
    appNameEmbedded: {
      version: "app-name-0.0.1",
      expectedTags: ["myapp:app-name-0.0.1", "myapp:app-name-latest"],
      description: "embedded app name version",
    },
    appNameStandard: {
      version: "app-name-1.0.0",
      expectedTags: [
        "myapp:app-name-1.0.0",
        "myapp:app-name-1.0",
        "myapp:app-name-1",
        "myapp:app-name-latest",
      ],
      description: "standard app name semver",
    },
    appNameVPrefixed: {
      version: "app-name-v1.0.0",
      expectedTags: [
        "myapp:app-name-v1.0.0",
        "myapp:app-name-v1.0",
        "myapp:app-name-v1",
        "myapp:app-name-latest",
      ],
      description: "app name with v-prefix",
    },
    appNameVInitial: {
      version: "app-name-v0.1.0",
      expectedTags: ["myapp:app-name-v0.1.0", "myapp:app-name-latest"],
      description: "app name with v-prefix initial version",
    },
    latestTag: {
      version: "latest",
      expectedTags: ["myapp:latest"],
      description: "latest tag",
    },
    dateBasedCompact: {
      version: "20230101",
      expectedTags: ["myapp:20230101", "myapp:latest"],
      description: "date based (compact)",
    },
    dateBasedDots: {
      version: "2023.04.09",
      expectedTags: ["myapp:2023.04.09", "myapp:latest"],
      description: "date based (dots)",
    },
    vDateTag: {
      version: "v2023.04.09",
      expectedTags: ["myapp:v2023.04.09", "myapp:latest"],
      description: "v-prefixed date based",
    },
    branchTag: {
      version: "main",
      expectedTags: ["myapp:main"],
      description: "branch name",
    },
    shortSHA: {
      version: "sha-abc1234",
      expectedTags: ["myapp:sha-abc1234"],
      description: "short git SHA",
    },
    longSHA: {
      version: "abcdef1234567890abcdef",
      expectedTags: ["myapp:abcdef1234567890abcdef"],
      description: "long git SHA",
    },
    releaseCandidate: {
      version: "release-candidate",
      expectedTags: ["myapp:release-candidate"],
      description: "release candidate",
    },
    prodSuffix: {
      version: "1.0.0-prod",
      expectedTags: ["myapp:1.0.0-prod"],
      description: "production build suffix",
    },
    vProdSuffix: {
      version: "v1.0.0_prod",
      expectedTags: ["myapp:v1.0.0_prod"],
      description: "v-prefixed production build with underscore",
    },
    featureTag: {
      version: "myapp-1.0.0-feature-X",
      expectedTags: ["myapp:myapp-1.0.0-feature-X"],
      description: "feature specific tag",
    },
    singleDigit: {
      version: "1",
      expectedTags: ["myapp:1", "myapp:latest"],
      description: "single digit version",
    },
    partialSemver: {
      version: "1.2",
      expectedTags: ["myapp:1.2", "myapp:1", "myapp:latest"],
      description: "partial semver (major.minor)",
    },
    vMajorOnly: {
      version: "v1",
      expectedTags: ["myapp:v1", "myapp:latest"],
      description: "v-prefixed major only",
    },
    vMajorMinor: {
      version: "v1.2",
      expectedTags: ["myapp:v1", "myapp:v1.2", "myapp:latest"],
      description: "v-prefixed major.minor",
    },
  };

  test(`should not generate non-v tags for v-tags`, async () => {
    const testCase = versionVariants.vStandard;
    jest.clearAllMocks();

    // Mock resolveDockerContext
    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: ".",
    });

    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: testCase.version,
        registries: registries.join(","),
        dockerfile: "Dockerfile",
        context: "./",
        canary_label: "preview",
        force_push: "false",
      };
      return inputs[name] || "";
    });

    fs.existsSync.mockReturnValue(false);
    await run();

    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.not.stringContaining("myapp:1.0.0"),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.not.stringContaining("myapp:1.0"),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.not.stringContaining("myapp:1"),
    );
  });

  // Iterate over the named version variants
  for (const key in versionVariants) {
    test(`should correctly handle various version formats: ${key}`, async () => {
      const testCase = versionVariants[key];
      // mutate all testCase.exceptedTags to include the registries
      const expectedTags = testCase.expectedTags.reduce(
        (acc, val) =>
          acc.concat(registries.map((registry) => `${registry}/${val}`)),
        [],
      );
      expectedTags.push(...testCase.expectedTags);
      jest.clearAllMocks();

      // Mock resolveDockerContext
      resolveDockerContext.mockReturnValue({
        dockerfile: "Dockerfile",
        context: ".",
      });

      // Set up the core.getInput mock for this version variant
      core.getInput.mockImplementation((name) => {
        const inputs = {
          image: "myapp",
          version: testCase.version,
          registries: registries.join(","),
          dockerfile: "Dockerfile",
          context: "./",
          canary_label: "preview",
          force_push: "false",
        };
        return inputs[name] || "";
      });

      // Ensure no docker-compose file is found
      fs.existsSync.mockReturnValue(false);

      // Run the main function
      await run();

      // Retrieve the "tags" output and split into an array
      const tagsOutput = core.setOutput.mock.calls.find(
        (call) => call[0] === "tags",
      )[1];
      const actualTags = tagsOutput.split(",");

      console.log(
        `Generated tags for ${testCase.description}: ${actualTags.join(", ")}`,
      );
      console.log(`Expected tags: ${expectedTags.join(", ")}`);

      // Assert that every expected tag is present
      expect(actualTags.sort()).toEqual(expectedTags.sort());

      testCase.expectedTags.forEach((expectedTag) => {
        expect(actualTags).toContain(expectedTag);
      });
    });
  }
});
