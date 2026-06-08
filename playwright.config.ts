import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3003",
    headless: true,
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "node node_modules/next/dist/server/lib/start-server.js",
    url: "http://localhost:3003/api/health",
    reuseExistingServer: true,
    cwd: ".",
  },
});