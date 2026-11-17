import { defineConfig } from "@playwright/test";

// Uses the machine's installed Chrome so no browser download is needed. Set E2E_CHANNEL=msedge to use Edge.
const channel = process.env.E2E_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", channel, trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 180_000 },
});
