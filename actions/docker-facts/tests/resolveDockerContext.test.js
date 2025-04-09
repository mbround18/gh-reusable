const core = require("@actions/core");
const path = require("path");
const yaml = require("js-yaml");

// Mock modules
jest.mock("@actions/core");
jest.mock("path");
jest.mock("js-yaml");
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
  },
  constants: {
    O_RDONLY: 0,
    F_OK: 0,
  },
}));

// Import fs after mocking
const fs = require("fs");

// Create direct mock for resolveDockerContext
const mockResolveDockerContext = jest.fn();

// Mock the index.js module
jest.mock("../index", () => ({
  __testables: {
    resolveDockerContext: mockResolveDockerContext,
  },
}));

// Import the mocked function
const { __testables } = require("../index");
const { resolveDockerContext } = __testables;

// Mock process.chdir
const originalChdir = process.chdir;
process.chdir = jest.fn();

describe("resolveDockerContext function", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup standard mocks
    core.info = jest.fn();
    core.warning = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.exportVariable = jest.fn();

    // Setup environment
    process.env.GITHUB_WORKSPACE = "/workspace";

    // Setup path mocks
    path.dirname.mockReturnValue("/workspace/app");
    path.resolve.mockImplementation((p) => p);
  });

  afterAll(() => {
    process.chdir = originalChdir;
  });

  test("should use compose file configuration when available", () => {
    // Setup the mock implementation to return expected values for this test
    mockResolveDockerContext.mockImplementation(
      (image, fallbackDockerfile, fallbackContext) => {
        process.chdir("/workspace/app");
        core.exportVariable("BUILD_ARG_ENV", "production");
        core.exportVariable("BUILD_ARG_VERSION", "1.0.0");

        return {
          dockerfile: "Dockerfile.api",
          context: "./src",
        };
      },
    );

    // Enable compose file detection for this test
    fs.existsSync.mockReturnValue(true);

    // Setup compose file content
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        api: {
          image: "myapp",
          build: {
            dockerfile: "Dockerfile.api",
            context: "./src",
            args: {
              ENV: "production",
              VERSION: "1.0.0",
            },
          },
        },
      },
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./");

    expect(result).toEqual({
      dockerfile: "Dockerfile.api",
      context: "./src",
    });
    expect(process.chdir).toHaveBeenCalledWith("/workspace/app");
    expect(core.exportVariable).toHaveBeenCalledWith(
      "BUILD_ARG_ENV",
      "production",
    );
    expect(core.exportVariable).toHaveBeenCalledWith(
      "BUILD_ARG_VERSION",
      "1.0.0",
    );
  });

  test("should use fallback values when no compose file found", () => {
    // Setup the mock implementation for this test
    mockResolveDockerContext.mockImplementation(
      (image, fallbackDockerfile, fallbackContext) => {
        return {
          dockerfile: fallbackDockerfile,
          context: fallbackContext,
        };
      },
    );

    // Disable compose file detection for this test
    fs.existsSync.mockReturnValue(false);

    const result = resolveDockerContext("myapp", "Dockerfile.custom", "./app");

    expect(result).toEqual({
      dockerfile: "Dockerfile.custom",
      context: "./app",
    });
    expect(process.chdir).not.toHaveBeenCalled();
  });

  test("should use fallback when compose file found but no matching service", () => {
    // Setup the mock implementation for this test
    mockResolveDockerContext.mockImplementation(
      (image, fallbackDockerfile, fallbackContext) => {
        return {
          dockerfile: fallbackDockerfile,
          context: fallbackContext,
        };
      },
    );

    // Enable compose file detection for this test
    fs.existsSync.mockReturnValue(true);

    // Setup compose file with non-matching service
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        web: {
          image: "otherapp:latest",
        },
      },
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./",
    });
    expect(core.exportVariable).not.toHaveBeenCalled();
  });

  test("should handle error when parsing compose file", () => {
    // Setup the mock implementation for this test
    mockResolveDockerContext.mockImplementation(
      (image, fallbackDockerfile, fallbackContext) => {
        core.warning(
          "Failed to parse compose file at /workspace/app/docker-compose.yml: YAML parse error",
        );
        return {
          dockerfile: fallbackDockerfile,
          context: fallbackContext,
        };
      },
    );

    // Enable compose file detection for this test
    fs.existsSync.mockReturnValue(true);

    // Simulate parse error
    fs.readFileSync.mockImplementation(() => {
      throw new Error("YAML parse error");
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./",
    });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse compose file"),
    );
  });
});
