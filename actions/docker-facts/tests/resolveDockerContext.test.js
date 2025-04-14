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
      "",
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
      "",
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

  test("should use default values when no compose file", () => {
    composeExists.mockReturnValue(null);

    const result = resolveDockerContext("myapp", "Dockerfile", "./context");

    expect(composeExists).toHaveBeenCalled();
    expect(parseCompose).not.toHaveBeenCalled();
    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./context",
      target: undefined,
    });
  });

  test("should use docker-compose.yml config when available", () => {
    composeExists.mockReturnValueOnce("/test-workspace/docker-compose.yml");
    parseCompose.mockReturnValueOnce({
      dockerfile: "custom.Dockerfile",
      context: "./src",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./context");

    expect(composeExists).toHaveBeenCalledWith(
      expect.stringContaining("/docker-compose.yml"),
    );
    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
      "myapp",
      "",
    );
    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./src",
    });
  });

  test("should handle target parameter", () => {
    composeExists.mockReturnValueOnce("/test-workspace/docker-compose.yml");
    parseCompose.mockReturnValueOnce({
      dockerfile: "custom.Dockerfile",
      context: "./src",
      target: "production",
    });

    const result = resolveDockerContext(
      "myapp",
      "Dockerfile",
      "./context",
      "production",
    );

    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
      "myapp",
      "production",
    );
    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./src",
      target: "production",
    });
  });

  test("should fall back to default when compose parsing fails", () => {
    composeExists.mockReturnValueOnce("/test-workspace/docker-compose.yml");
    parseCompose.mockImplementationOnce(() => {
      throw new Error("Mock error");
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./context");

    expect(composeExists).toHaveBeenCalled();
    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yml",
      "myapp",
      "",
    );
    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: "./context",
      target: undefined,
    });
  });

  test("should use docker-compose.yaml config when available", () => {
    composeExists
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("/test-workspace/docker-compose.yaml");
    parseCompose.mockReturnValueOnce({
      dockerfile: "custom.Dockerfile",
      context: "./src",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", "./context");

    expect(composeExists).toHaveBeenCalledWith(
      expect.stringContaining("/docker-compose.yml"),
    );
    expect(composeExists).toHaveBeenCalledWith(
      expect.stringContaining("/docker-compose.yaml"),
    );
    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yaml",
      "myapp",
      "",
    );
    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./src",
    });
  });
});
