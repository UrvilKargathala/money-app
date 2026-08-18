import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false,
  },
});
