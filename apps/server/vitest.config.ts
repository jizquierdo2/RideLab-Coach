import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@ridelab/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
