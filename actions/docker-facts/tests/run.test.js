const core = require("@actions/core");
const github = require("@actions/github");
const path = require("path");
const yaml = require("js-yaml");

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

jest.mock("../src/resolveDockerContext", () => jest.fn());

const originalChdir = process.chdir;
process.chdir = jest.fn();

const fs = require("fs");
const resolveDockerContext = require("../src/resolveDockerContext");
const { run } = require("../index");

describe("Main run function", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    core.getInput = jest.fn();
    core.setOutput = jest.fn();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.exportVariable = jest.fn();
    core.setFailed = jest.fn();

    github.context = {
      eventName: "push",
      ref: "refs/heads/main",
      payload: {
        repository: { default_branch: "main" },
      },
    };
  });

  afterAll(() => {
    process.chdir = originalChdir;
  });

  test("should correctly process inputs and set outputs", async () => {
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

    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile.prod",
      context: "./app",
    });

    await run();

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
    core.getInput = jest.fn().mockImplementation(() => {
      throw new Error("Test error");
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("Action failed: Test error");
  });

  test("should handle errors in GitHub context", async () => {
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

    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: ".",
    });

    Object.defineProperty(github.context, "ref", {
      get: function () {
        throw new Error("Cannot read properties of undefined");
      },
    });

    await run();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Error parsing GitHub context: Cannot read properties of undefined",
      ),
    );

    expect(core.setOutput).toHaveBeenCalledWith("tags", expect.any(String));
  });

  test("should use target from docker-compose when prepend_target is enabled", async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: "1.0.0",
        registries: "docker.io",
        dockerfile: "Dockerfile",
        context: ".",
        canary_label: "canary",
        force_push: "false",
        prepend_target: "true",
        target: "", // No target specified in inputs
      };
      return inputs[name] || "";
    });

    // Mock resolveDockerContext to return a target from docker-compose
    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: "./app",
      target: "production", // Target found in docker-compose
    });

    await run();

    // Check that the target was properly prepended to tags
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.stringContaining("myapp:production-1.0.0"),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.stringContaining("docker.io/myapp:production-1.0.0"),
    );
  });

  test("should prioritize input target over docker-compose target", async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: "1.0.0",
        registries: "docker.io",
        dockerfile: "Dockerfile",
        context: ".",
        prepend_target: "true",
        target: "custom-target", // Target specified in inputs
      };
      return inputs[name] || "";
    });

    // Mock resolveDockerContext to return a different target from docker-compose
    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: "./app",
      target: "production", // Different target found in docker-compose
    });

    await run();

    // Check that the input target was properly used
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.stringContaining("myapp:custom-target-1.0.0"),
    );
  });

  test("should not prepend target when prepend_target is false", async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        image: "myapp",
        version: "1.0.0",
        registries: "docker.io",
        dockerfile: "Dockerfile",
        context: ".",
        prepend_target: "false",
        target: "custom-target",
      };
      return inputs[name] || "";
    });

    resolveDockerContext.mockReturnValue({
      dockerfile: "Dockerfile",
      context: ".",
      target: "custom-target",
    });

    await run();

    // Check that tags don't have the target prefix
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.stringContaining("myapp:1.0.0"),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "tags",
      expect.not.stringContaining("myapp:custom-target-1.0.0"),
    );
  });

  const registries = ["docker.io", "ghcr.io"];

  const versionVariants = {
    standard: {
      version: "1.0.0",
      expectedTags: ["myapp:1.0.0", "myapp:1.0", "myapp:1"],
      description: "standard semver",
    },
    initialDev: {
      version: "0.0.1",
      expectedTags: ["myapp:0.0.1"],
      description: "initial development version",
    },
    earlyMinor: {
      version: "0.1.0",
      expectedTags: ["myapp:0.1.0"],
      description: "early minor semver",
    },
    vPrefixedSemver: {
      version: "v1.1.1",
      expectedTags: ["myapp:v1.1.1", "myapp:v1.1", "myapp:v1"],
      description: "v-prefixed semver",
    },
    vStandard: {
      version: "v1.0.0",
      expectedTags: ["myapp:v1.0.0", "myapp:v1.0", "myapp:v1"],
      description: "v-prefixed standard semver",
    },
    vInitialDev: {
      version: "v0.0.1",
      expectedTags: ["myapp:v0.0.1"],
      description: "v-prefixed initial development",
    },
    vEarlyMinor: {
      version: "v0.1.0",
      expectedTags: ["myapp:v0.1.0"],
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
      expectedTags: ["myapp:app-name-0.0.1"],
      description: "embedded app name version",
    },
    appNameStandard: {
      version: "app-name-1.0.0",
      expectedTags: [
        "myapp:app-name-1.0.0",
        "myapp:app-name-1.0",
        "myapp:app-name-1",
      ],
      description: "standard app name semver",
    },
    appNameVPrefixed: {
      version: "app-name-v1.0.0",
      expectedTags: [
        "myapp:app-name-v1.0.0",
        "myapp:app-name-v1.0",
        "myapp:app-name-v1",
      ],
      description: "app name with v-prefix",
    },
    appNameVInitial: {
      version: "app-name-v0.1.0",
      expectedTags: ["myapp:app-name-v0.1.0"],
      description: "app name with v-prefix initial version",
    },
    latestTag: {
      version: "latest",
      expectedTags: ["myapp:latest"],
      description: "latest tag",
    },
    dateBasedCompact: {
      version: "20230101",
      expectedTags: ["myapp:20230101"],
      description: "date based (compact)",
    },
    dateBasedDots: {
      version: "2023.04.09",
      expectedTags: ["myapp:2023.04.09"],
      description: "date based (dots)",
    },
    vDateTag: {
      version: "v2023.04.09",
      expectedTags: ["myapp:v2023.04.09"],
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
      expectedTags: ["myapp:1"],
      description: "single digit version",
    },
    partialSemver: {
      version: "1.2",
      expectedTags: ["myapp:1.2", "myapp:1"],
      description: "partial semver (major.minor)",
    },
    vMajorOnly: {
      version: "v1",
      expectedTags: ["myapp:v1"],
      description: "v-prefixed major only",
    },
    vMajorMinor: {
      version: "v1.2",
      expectedTags: ["myapp:v1", "myapp:v1.2"],
      description: "v-prefixed major.minor",
    },
  };

  test(`should not generate non-v tags for v-tags`, async () => {
    const testCase = versionVariants.vStandard;
    jest.clearAllMocks();

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

  for (const key in versionVariants) {
    test(`should correctly handle various version formats: ${key}`, async () => {
      const testCase = versionVariants[key];
      const expectedTags = testCase.expectedTags.reduce(
        (acc, val) =>
          acc.concat(registries.map((registry) => `${registry}/${val}`)),
        [],
      );
      expectedTags.push(...testCase.expectedTags);
      jest.clearAllMocks();

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

      const tagsOutput = core.setOutput.mock.calls.find(
        (call) => call[0] === "tags",
      )[1];
      const actualTags = tagsOutput.split(",");

      expect(actualTags.sort()).toEqual(expectedTags.sort());

      testCase.expectedTags.forEach((expectedTag) => {
        expect(actualTags).toContain(expectedTag);
      });
    });
  }
});
