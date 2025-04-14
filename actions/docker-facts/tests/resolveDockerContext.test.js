const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const resolveDockerContext = require("../src/resolveDockerContext");
const { composeExists, parseCompose } = require("../src/parseCompose");

jest.mock("fs");
jest.mock("@actions/core");
jest.mock("../src/parseCompose");

// Mock path.normalize to just return the path
jest.mock("path", () => ({
  join: jest.fn((...parts) => parts.join("/")),
  normalize: jest.fn((path) => path),
  isAbsolute: jest.fn((path) => path.startsWith("/")),
}));

describe("resolveDockerContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();

    process.env.GITHUB_WORKSPACE = "/test-workspace";
  });

  test("should use docker-compose.yml config when available", () => {
    // Mock file existence
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });

    // Mock parseCompose return value
    parseCompose.mockReturnValue({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      target: "",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      target: "",
    });

    // Verify composeExists was called with docker-compose.yml path
    expect(composeExists).toHaveBeenCalledWith(
      expect.stringContaining("docker-compose.yml"),
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
      target: undefined,
    });

    expect(composeExists).toHaveBeenCalled();
  });

  test("should use docker-compose.yaml config when available", () => {
    // Return null for yml but match yaml
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yaml")
      ) {
        return "/test-workspace/docker-compose.yaml";
      }
      return null;
    });

    // Mock parseCompose return value
    parseCompose.mockReturnValue({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      target: "",
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "custom.Dockerfile",
      context: "./app",
      target: "",
    });

    // Verify composeExists was called with docker-compose.yaml
    const calls = composeExists.mock.calls;
    const yamlCalls = calls.filter(
      (call) =>
        call[0] &&
        typeof call[0] === "string" &&
        call[0].includes("docker-compose.yaml"),
    );
    expect(yamlCalls.length).toBeGreaterThan(0);

    expect(parseCompose).toHaveBeenCalledWith(
      "/test-workspace/docker-compose.yaml",
      "myapp",
      "",
    );
  });

  test("should use fallback values when docker-compose parsing fails", () => {
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });

    parseCompose.mockImplementation(() => {
      throw new Error("Parse error");
    });

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: ".",
      target: undefined,
    });

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Parse error"),
    );
  });

  test("should use fallback values when docker-compose parsing returns null", () => {
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });
    parseCompose.mockReturnValue(null);

    const result = resolveDockerContext("myapp", "Dockerfile", ".");

    expect(result).toEqual({
      dockerfile: "Dockerfile",
      context: ".",
      target: undefined,
    });

    expect(core.info).toHaveBeenCalledWith(
      expect.stringMatching(/Using fallback values/),
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

  test("should handle target parameter", () => {
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });

    parseCompose.mockReturnValue({
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

  test("should check for compose files in context directory", () => {
    // Mock to return a file in the context directory
    composeExists.mockImplementation((filePath) => {
      if (filePath === "/test-workspace/my-context/docker-compose.yml") {
        return filePath;
      }
      return null;
    });

    parseCompose.mockReturnValue({
      dockerfile: "custom.Dockerfile",
      context: "./src",
      target: "",
    });

    resolveDockerContext("myapp", "Dockerfile", "my-context");

    // Check that the context directory was searched
    const calls = composeExists.mock.calls;
    const contextCalls = calls.filter(
      (call) =>
        call[0] &&
        typeof call[0] === "string" &&
        call[0].includes("my-context"),
    );
    expect(contextCalls.length).toBeGreaterThan(0);
  });

  test("should correctly handle docker-compose target with no input target", () => {
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });

    parseCompose.mockReturnValue({
      dockerfile: "custom/Dockerfile",
      context: "./app",
      target: "production",
    });

    const result = resolveDockerContext(
      "myapp",
      "Dockerfile",
      ".",
      "", // No input target
    );

    expect(result).toEqual({
      dockerfile: "custom/Dockerfile",
      context: "./app",
      target: "production",
    });
  });

  test("should prioritize input target over docker-compose target", () => {
    composeExists.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes("docker-compose.yml")
      ) {
        return "/test-workspace/docker-compose.yml";
      }
      return null;
    });

    parseCompose.mockReturnValue({
      dockerfile: "custom/Dockerfile",
      context: "./app",
      target: "production",
    });

    const result = resolveDockerContext(
      "myapp",
      "Dockerfile",
      ".",
      "development", // Input target takes precedence
    );

    expect(result).toEqual({
      dockerfile: "custom/Dockerfile",
      context: "./app",
      target: "development", // The input target should override the compose target
    });
  });
});
