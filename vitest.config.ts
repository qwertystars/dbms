import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Client components (the family map) run in a simulated browser.
    environmentMatchGlobs: [["tests/client/**", "jsdom"]],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_URL: ":memory:",
      APP_BASE_URL: "http://localhost:3000",
      NODE_ENV: "test",
      AUTH_ISSUER: "http://localhost:3000",
      AUTH_AUDIENCE: "family-social-network",
      AUTH_DEV_MODE: "false",
    },
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
