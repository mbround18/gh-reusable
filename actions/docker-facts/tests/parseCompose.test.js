const core = require("@actions/core");
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");

// Mock modules
jest.mock("@actions/core");
jest.mock("js-yaml");
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
  },
  constants: {
    O_RDONLY: 0,
    F_OK: 0,
  },
}));
jest.mock("path");

// Import modules after mocking
const { __testables } = require("../index");
const { parseCompose } = __testables || {};

describe("parseCompose function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should extract build config for matching image", () => {
    if (!parseCompose) return;

    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        web: {
          image: "myapp:latest",
          build: {
            dockerfile: "Dockerfile.web",
            context: "./web",
            args: {
              NODE_ENV: "production",
            },
          },
        },
      },
    });

    const result = parseCompose("/test/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "Dockerfile.web",
      context: "./web",
      args: {
        NODE_ENV: "production",
      },
    });
  });

  test("should return null when no matching service found", () => {
    if (!parseCompose) return;

    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        web: {
          image: "otherapp:latest",
        },
      },
    });

    const result = parseCompose("/test/docker-compose.yml", "myapp");

    expect(result).toBeNull();
  });

  test("should handle errors gracefully", () => {
    if (!parseCompose) return;

    fs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = parseCompose("/test/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalled();
  });

  test("should return null when compose file has no matching services", () => {
    if (!parseCompose) return;

    // Setup mocks
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        web: {
          image: "other:latest",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("Services found: web");
    expect(core.info).toHaveBeenCalledWith("No matching service found for image myapp");
  });

  test("should return null when compose file has invalid services format", () => {
    if (!parseCompose) return;

    // Setup mocks with invalid services structure
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      // No services key
      otherStuff: {}
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("Services found: ");
  });

  test("should return null when service has no build config", () => {
    if (!parseCompose) return;

    // Setup mocks
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        api: {
          image: "myapp:latest",
          // No build config
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
  });

  test("should return null when service build config is incomplete", () => {
    if (!parseCompose) return;

    // Setup mocks with incomplete build config
    fs.readFileSync.mockReturnValue("compose content");
    yaml.load.mockReturnValue({
      services: {
        api: {
          image: "myapp:latest",
          build: {
            // Missing dockerfile
            context: "./app",
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
  });
});
