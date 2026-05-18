import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.js"],
    environment: "node",
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 5_000,
    forceExit: true,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["index.js"],
      exclude: ["node_modules", "tests", "dist"],
    },
  },
});
