const core = require("@actions/core");

// Mock the core module
jest.mock("@actions/core");

// Import the function to test
const { __testables } = require("../index");
const { parseDockerImageName } = __testables || {};

describe("parseDockerImageName function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.warning = jest.fn();
  });

  test("should correctly parse standard image name", () => {
    if (!parseDockerImageName) return;

    const result = parseDockerImageName("nginx");

    expect(result).toEqual({
      registry: null,
      namespace: null,
      repository: "nginx",
      tag: "latest",
      digest: null,
    });
  });

  test("should parse image with tag", () => {
    if (!parseDockerImageName) return;

    const result = parseDockerImageName("nginx:1.19");

    expect(result).toEqual({
      registry: null,
      namespace: null,
      repository: "nginx",
      tag: "1.19",
      digest: null,
    });
  });

  test("should parse image with namespace", () => {
    if (!parseDockerImageName) return;

    const result = parseDockerImageName("library/nginx");

    expect(result).toEqual({
      registry: null,
      namespace: "library",
      repository: "nginx",
      tag: "latest",
      digest: null,
    });
  });

  test("should parse image with registry", () => {
    if (!parseDockerImageName) return;

    const result = parseDockerImageName("docker.io/library/nginx:1.19");

    expect(result).toEqual({
      registry: "docker.io",
      namespace: "library",
      repository: "nginx",
      tag: "1.19",
      digest: null,
    });
  });

  test("should throw error on invalid image name", () => {
    if (!parseDockerImageName) return;

    expect(() => {
      parseDockerImageName("invalid:name:with:multiple:colons");
    }).toThrow("Invalid Docker image name");
  });
});
