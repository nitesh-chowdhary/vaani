import { defineConfig, devices } from '@playwright/test';

// Dedicated test origins and disposable database; never reuse a personal session.
const webPort = Number(process.env.E2E_WEB_PORT ?? 5187);
const apiPort = Number(process.env.E2E_API_PORT ?? 3187);
const baseURL = `http://localhost:${webPort}`;
const apiURL = `http://localhost:${apiPort}`;
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      name: 'API with disposable MongoDB',
      command:
        'npm run build -w @vaani/learning-core && npx tsx tests/e2e/server.ts',
      url: `${apiURL}/api/v1/course`,
      env: { E2E_API_PORT: String(apiPort), E2E_WEB_ORIGIN: baseURL },
      timeout: 120_000,
      reuseExistingServer:
        process.env.E2E_REUSE_SERVERS === '1' && !process.env.CI,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      name: 'Vite',
      command: `npm run dev -w @vaani/web -- --port ${webPort} --strictPort`,
      url: baseURL,
      env: { VITE_API_BASE_URL: `${apiURL}/api/v1` },
      reuseExistingServer:
        process.env.E2E_REUSE_SERVERS === '1' && !process.env.CI,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
