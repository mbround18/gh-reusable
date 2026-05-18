import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 5_000,
    forceExit: true,
    reporters: ["verbose"],
  },
});
