import { defineConfig, devices } from '@playwright/test'

// https://playwright.dev/docs/test-configuration
// Default project targets a 360px-wide low-cost Android viewport (NFR2) since that is the
// primary device class Mira is designed for. Add wider projects only for regressions that are
// specifically about larger screens.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'mobile-360',
      use: {
        viewport: { width: 360, height: 740 },
        userAgent: devices['Galaxy S8'].userAgent,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
