const path = require("path");
const core = require("@actions/core");
const { composeExists, parseCompose } = require("../src/parseCompose");
const resolveDockerContext = require("../src/resolveDockerContext");

jest.mock("path");
jest.mock("@actions/core");
jest.mock("../src/parseCompose");

describe("resolveDockerContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    core.info = jest.fn();
    core.warning = jest.fn();

    process.env.GITHUB_WORKSPACE = "/test-workspace";

    path.join = jest.fn().mockImplementation((...parts) => parts.join("/"));
  });

  test("should use docker-compose.yml config when available", () => {
    composeExists.mockImplementation((filePath) => {
      if (filePath.endsWith("docker-compose.yml")) {
        return filePath;
      }
      return null;
    });

    parseCompose.mockReturnValue({
      dockerfile: "custom.Dockerfile",
      context: "./app",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
    });

    expect(composeExists).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
    );
    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
      "myapp",
    );
  });

  test("should use fallback values when no docker-compose file is found", () => {
    composeExists.mockReturnValue(null);

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: ".",
    });

    expect(composeExists).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
    );
    expect(composeExists).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yaml",
    );
  });

  test("should use docker-compose.yaml config when available", () => {
    composeExists.mockImplementation((filePath) => {
      if (filePath.endsWith("docker-compose.yaml")) {
        return filePath;
      }
      return null;
    });

    parseCompose.mockReturnValue({
      dockerfile: "custom.Dockerfile",
      context: "./app",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
    });

    expect(composeExists).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
    );
    expect(composeExists).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yaml",
    );
    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yaml",
      "myapp",
    );
  });

  test("should use fallback values when docker-compose parsing fails", () => {
    composeExists.mockReturnValue("/test-workspace/docker-compose.yml");
    parseCompose.mockImplementation(() => {
      throw new Error("Parse error");
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: ".",
    });
  });

  test("should use fallback values when docker-compose parsing returns null", () => {
    composeExists.mockReturnValue("/test-workspace/docker-compose.yml");
    parseCompose.mockReturnValue(null);

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: ".",
    });
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("No matching service found"),
    );
  });
});
