import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// Locally, credentials live in .env.local. In CI they come from GitHub secrets.
loadEnv({ path: '.env.local', quiet: true })

const PORT = 5173
// Set E2E_BASE_URL (e.g. http://localhost:8080) to test an already-running build, such as the Docker image.
const externalBaseURL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  // All tests share one Supabase test account, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseURL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
