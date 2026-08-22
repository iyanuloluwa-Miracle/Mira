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
  // The app server under test holds a single Prisma connection pool against Neon's direct
  // (non-pooled) endpoint, which caps concurrent connections much lower than a pgbouncer-backed
  // one. Several Playwright workers hammering it at once was enough to exhaust that pool
  // (PrismaClientInitializationError / P1001) — one worker keeps this suite's request volume
  // within what the shared database can actually sustain.
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  // The dev/CI database is remote (Neon serverless Postgres) rather than a local instance.
  // Its compute auto-suspends when idle and can take 2-3s to resume on the first query after a
  // gap, on top of genuine cross-region round-trip latency for every query after that — real
  // network behavior, not something to mock away. The default 5s assertion timeout is tuned for
  // in-memory/local backends and flakes against that, especially on /complete which makes
  // several sequential round trips. This does not change the app's own NFR3 latency budget
  // (serverLatencyMs, measured in server/api/screening/[id]/complete.post.ts).
  expect: { timeout: 15_000 },
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
