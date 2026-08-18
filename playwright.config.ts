import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.MATI_E2E_PORT ?? 3210);
// Set MATI_E2E_CHROMIUM to reuse a Chromium already on the machine instead of a
// Playwright-managed download. CI leaves it unset and uses `playwright install`.
const executablePath = process.env.MATI_E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'he-IL',
    trace: 'on-first-retry',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} },
  }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
