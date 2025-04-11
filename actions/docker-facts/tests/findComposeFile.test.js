const core = require("@actions/core");
const fs = require("fs");
const path = require("path");

jest.mock("@actions/core");
jest.mock("path");
jest.mock("fs", () => ({
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

const { __testables } = require("../index");
const { findComposeFile } = __testables || {};

describe("findComposeFile function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    path.join = jest.fn((dir, file) => `${dir}/${file}`);
  });

  test("should find docker-compose.yml when it exists", () => {
    if (!findComposeFile) return;

    fs.existsSync = jest
      .fn()
      .mockImplementation((path) => path.endsWith("docker-compose.yml"));

    const result = findComposeFile(["/test/dir"]);

    expect(result).toBe("/test/dir/docker-compose.yml");
    expect(fs.existsSync).toHaveBeenCalledWith("/test/dir/docker-compose.yml");
  });

  test("should find docker-compose.yaml when it exists", () => {
    if (!findComposeFile) return;

    fs.existsSync = jest
      .fn()
      .mockImplementation((path) => path.endsWith("docker-compose.yaml"));

    const result = findComposeFile(["/test/dir"]);

    expect(result).toBe("/test/dir/docker-compose.yaml");
    expect(fs.existsSync).toHaveBeenCalledWith("/test/dir/docker-compose.yml");
    expect(fs.existsSync).toHaveBeenCalledWith("/test/dir/docker-compose.yaml");
  });

  test("should return null when no compose file found", () => {
    if (!findComposeFile) return;

    fs.existsSync = jest.fn().mockReturnValue(false);

    const result = findComposeFile(["/test/dir", "/another/dir"]);

    expect(result).toBeNull();
    expect(fs.existsSync).toHaveBeenCalledTimes(4);
  });
});
