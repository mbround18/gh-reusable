module.exports = {
  clearMocks: true,
  moduleFileExtensions: ["js", "ts"],
  testMatch: ["**/*.test.js"],
  verbose: true,
  setupFilesAfterEnv: ["./jest.setup.js"],
  testEnvironment: "node",
};
