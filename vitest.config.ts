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
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5433/family_social_test",
      APP_BASE_URL: "http://localhost:3000",
      NODE_ENV: "test",
      AUTH_ISSUER: "http://localhost:3000",
      AUTH_AUDIENCE: "family-social-network",
    },
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
