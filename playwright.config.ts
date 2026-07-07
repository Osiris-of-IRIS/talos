import { defineConfig, devices } from '@playwright/test';

// E2E config. Playwright drives a real browser against the Vite dev server. Decision IDs: ADR-0001.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173/talos/',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/talos/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
