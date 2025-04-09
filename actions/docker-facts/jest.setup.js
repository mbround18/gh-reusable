// Set environment variables for tests
process.env.NODE_ENV = "test";
process.env.GITHUB_WORKSPACE = "/workspace";
process.env.GITHUB_REPOSITORY = "test-owner/test-repo";

// Do not use beforeEach directly in setup file
// Instead, just export the mock reset function that tests can use
module.exports = {
  resetMocks: () => {
    jest.resetAllMocks();
  },
};
