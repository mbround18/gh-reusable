const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");
const { parseCompose, composeExists } = require("../src/parseCompose");

// Mock dependencies
jest.mock("fs");
jest.mock("js-yaml");
jest.mock("@actions/core");

describe("parseCompose function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should return null when compose file cannot be read", () => {
    fs.readFileSync = jest.fn().mockImplementation(() => {
      throw new Error("File read error");
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Error parsing compose file"),
    );
  });

  test("should return null when compose file has no services", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("No services found in compose file");
  });

  test("should return null when no matching service found", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "otherapp:latest",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith(
      "No matching service found for image myapp",
    );
  });

  test("should return null when service has no build config", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:latest",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith(
      "Service web has no build configuration",
    );
  });

  test("should handle string build config", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:latest",
          build: "./app",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./app",
    });
  });

  test("should handle object build config", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:latest",
          build: {
            context: "./app",
            dockerfile: "custom.Dockerfile",
            args: {
              VERSION: "1.0.0",
            },
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      args: {
        VERSION: "1.0.0",
      },
    });
  });

  test("should use default dockerfile when not specified in build config", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:latest",
          build: {
            context: "./app",
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./app",
      args: undefined,
    });
  });

  test("should return null when build object is incomplete (no context)", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:latest",
          build: {
            dockerfile: "custom.Dockerfile",
            // Missing context
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("has incomplete build configuration"),
    );
  });

  test("should extract build config for semver-like image", () => {
    fs.readFileSync = jest.fn().mockReturnValue('version: "3"');
    yaml.load = jest.fn().mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:1.0.0",
          build: {
            context: "./app",
            dockerfile: "custom.Dockerfile",
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      args: undefined,
    });
  });
});

describe("composeExists function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.warning = jest.fn();
  });

  test("should return file path when file exists", () => {
    fs.existsSync = jest.fn().mockReturnValue(true);

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBe("/path/to/docker-compose.yml");
  });

  test("should return null when file does not exist", () => {
    fs.existsSync = jest.fn().mockReturnValue(false);

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBeNull();
  });

  test("should return null and log warning when error occurs", () => {
    fs.existsSync = jest.fn().mockImplementation(() => {
      throw new Error("File system error");
    });

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith(
      "Error checking compose file: File system error",
    );
  });
});
