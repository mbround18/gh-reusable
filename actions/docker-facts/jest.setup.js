// Set environment variables for tests
process.env.NODE_ENV = "test";
process.env.GITHUB_WORKSPACE = "/workspace";
process.env.GITHUB_REPOSITORY = "test-owner/test-repo";

// Mock fs module with promises support
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  constants: {
    O_RDONLY: 0,
    F_OK: 0,
  },
}));

// Mock GitHub Actions core module
jest.mock("@actions/core", () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  exportVariable: jest.fn(),
  summary: {
    addRaw: jest.fn().mockReturnThis(),
    addHeading: jest.fn().mockReturnThis(),
    addCodeBlock: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock GitHub context
jest.mock("@actions/github", () => ({
  context: {
    eventName: "push",
    ref: "refs/heads/main",
    payload: {
      repository: {
        default_branch: "main",
      },
      pull_request: undefined,
    },
  },
}));

// Do not use beforeEach directly in setup file
// Instead, just export the mock reset function that tests can use
module.exports = {
  resetMocks: () => {
    jest.resetAllMocks();
  },
};
