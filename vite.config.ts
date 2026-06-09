import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/QuantCred/",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
    __APP_COMMIT_SHA__: JSON.stringify(process.env.VITE_APP_COMMIT_SHA ?? "local"),
    __APP_BUILD_TIME__: JSON.stringify(process.env.VITE_APP_BUILD_TIME ?? new Date().toISOString())
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"]
  }
});
