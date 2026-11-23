import os from "node:os"
import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT ?? 3217)

process.env.E2E_DATA_DIR ??= path.join(os.tmpdir(), `nimbus-e2e-${Date.now()}`)

const testEnv = {
  NODE_ENV: "production",
  DATA_DIR: process.env.E2E_DATA_DIR,
  TRANSCRIBER: "fake",
  DOWNLOADER: "fake",
  FAKE_DOWNLOAD_FILE: path.resolve(
    "tests/fixtures/.generated/gameplay-16x9.mp4"
  ),
  HIGHLIGHT_SELECTOR: "heuristic",
  E2E: "1",
  WORKER_POLL_MS: "250",
  LOG_LEVEL: "warn",
  ANTHROPIC_API_KEY: "",
}

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm run setup:vision && pnpm exec next build && pnpm exec next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: testEnv,
      stdout: "pipe",
    },
    {
      command: "pnpm worker",
      env: testEnv,
      wait: { stdout: /worker started/ },
      timeout: 60_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
})
