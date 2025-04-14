const yaml = require("js-yaml");
const fs = require("fs");
const core = require("@actions/core");
const { parseCompose, composeExists } = require("../src/parseCompose");

jest.mock("js-yaml");
jest.mock("fs");
jest.mock("@actions/core");

describe("parseCompose function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
  });

  test("should return null when compose file cannot be read", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("File read error");
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("File read error"),
    );
  });

  test("should return null when compose file has no services", () => {
    fs.readFileSync.mockReturnValue("version: '3'");
    yaml.load.mockReturnValue({ version: "3" });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("No services found in compose file");
  });

  test("should return null when no matching service found", () => {
    fs.readFileSync.mockReturnValue("version: '3'\nservices:\n  web: {}");
    yaml.load.mockReturnValue({
      version: "3",
      services: { web: {} },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("Found services: web");
    expect(core.info).toHaveBeenCalledWith(
      "No matching service found for image myapp",
    );
  });

  test("should return null when service has no build config", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp",
    );
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toBeNull();
    expect(core.info).toHaveBeenCalledWith("Found services: web");
    expect(core.info).toHaveBeenCalledWith(
      "Service web has no build configuration",
    );
  });

  test("should handle string build config", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp\n    build: ./app",
    );
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp",
          build: "./app",
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./app",
      args: undefined,
      target: "",
    });
  });

  test("should handle object build config", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp\n    build:\n      context: ./app\n      dockerfile: custom.Dockerfile\n      args:\n        VERSION: '1.0.0'",
    );
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp",
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
      target: "",
    });
  });

  test("should use default dockerfile when not specified in build config", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp\n    build:\n      context: ./app",
    );
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp",
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
      target: "",
    });
  });

  test("should handle build object with missing context", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp\n    build:\n      dockerfile: custom.Dockerfile",
    );
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp",
          build: {
            dockerfile: "custom.Dockerfile",
          },
        },
      },
    });

    const result = parseCompose("/path/to/docker-compose.yml", "myapp");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: ".",
      target: "",
    });
    expect(core.info).toHaveBeenCalledWith(
      "Service has incomplete build configuration (missing context)",
    );
  });

  test("should extract build config for semver-like image", () => {
    fs.readFileSync.mockReturnValue(
      "version: '3'\nservices:\n  web:\n    image: myapp:1.0.0\n    build:\n      context: ./app\n      dockerfile: custom.Dockerfile",
    );
    yaml.load.mockReturnValue({
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
      target: "",
    });
  });

  test("should find service with matching target when provided", () => {
    fs.readFileSync.mockReturnValue(`
      version: '3'
      services:
        web:
          image: myapp:1.0.0
          build:
            context: ./app
            dockerfile: Dockerfile.app
            target: production
        test:
          image: myapp:test
          build:
            context: ./test
            dockerfile: Dockerfile.test
            target: test
    `);
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:1.0.0",
          build: {
            context: "./app",
            dockerfile: "Dockerfile.app",
            target: "production",
          },
        },
        test: {
          image: "myapp:test",
          build: {
            context: "./test",
            dockerfile: "Dockerfile.test",
            target: "test",
          },
        },
      },
    });

    const result = parseCompose("docker-compose.yml", "myapp", "test");

    expect(result).toEqual({
      context: "./test",
      dockerfile: "Dockerfile.test",
      args: undefined,
      target: "test",
    });
  });

  test("should fall back to image match when target doesn't match", () => {
    fs.readFileSync.mockReturnValue(`
      version: '3'
      services:
        web:
          image: myapp:1.0.0
          build:
            context: ./app
            dockerfile: Dockerfile.app
            target: production
        test:
          image: otherapp:test
          build:
            context: ./test
            dockerfile: Dockerfile.test
            target: test
    `);
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:1.0.0",
          build: {
            context: "./app",
            dockerfile: "Dockerfile.app",
            target: "production",
          },
        },
        test: {
          image: "otherapp:test",
          build: {
            context: "./test",
            dockerfile: "Dockerfile.test",
            target: "test",
          },
        },
      },
    });

    const result = parseCompose("docker-compose.yml", "myapp", "nonexistent");

    // It should find the first service matching the image name
    expect(result).toEqual({
      context: "./app",
      dockerfile: "Dockerfile.app",
      args: undefined,
      target: "production",
    });
  });

  test("should include target from parameter if not in build config", () => {
    fs.readFileSync.mockReturnValue(`
      version: '3'
      services:
        web:
          image: myapp:1.0.0
          build:
            context: ./app
            dockerfile: Dockerfile.app
    `);
    yaml.load.mockReturnValue({
      version: "3",
      services: {
        web: {
          image: "myapp:1.0.0",
          build: {
            context: "./app",
            dockerfile: "Dockerfile.app",
          },
        },
      },
    });

    const result = parseCompose("docker-compose.yml", "myapp", "production");

    expect(result).toEqual({
      context: "./app",
      dockerfile: "Dockerfile.app",
      args: undefined,
      target: "",
    });
  });
});

describe("composeExists function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should return file path when file exists", () => {
    fs.existsSync.mockReturnValue(true);

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBe("/path/to/docker-compose.yml");
    expect(fs.existsSync).toHaveBeenCalledWith("/path/to/docker-compose.yml");
  });

  test("should return null when file does not exist", () => {
    fs.existsSync.mockReturnValue(false);

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBeNull();
    expect(fs.existsSync).toHaveBeenCalledWith("/path/to/docker-compose.yml");
  });

  test("should return null and log warning when error occurs", () => {
    fs.existsSync.mockImplementation(() => {
      throw new Error("File system error");
    });
    core.warning = jest.fn();

    const result = composeExists("/path/to/docker-compose.yml");

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith(
      "Error checking compose file: File system error",
    );
  });
});
