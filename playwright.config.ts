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
  // Above the 30s expect timeout below — otherwise the per-test timeout (default 30s) would cut
  // a test off before a single slow assertion inside it even got to use its own budget.
  timeout: 60_000,
  // The dev/CI database is remote (Neon serverless Postgres) rather than a local instance.
  // Its compute auto-suspends when idle and can take 2-3s to resume on the first query after a
  // gap, on top of genuine cross-region round-trip latency for every query after that — real
  // network behavior, not something to mock away. The default 5s assertion timeout is tuned for
  // in-memory/local backends and flakes against that, especially on /complete which makes
  // several sequential round trips. This does not change the app's own NFR3 latency budget
  // (serverLatencyMs, measured in server/api/screening/[id]/complete.post.ts).
  //
  // 30s specifically (not 15s): complete() correctly awaits every answer-sync still genuinely
  // in flight before asking the server to finish the session (see useScreeningSession.ts,
  // inFlightSyncs — fixed after this suite caught a real race where it didn't). A test answering
  // all 16 items back-to-back as fast as Playwright can click fires far more concurrent syncs
  // than a real person pacing through would, and Neon's connection pool queues rather than
  // rejects under that burst, adding real wall-clock time this budget has to cover.
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'mobile-360',
      // Every other spec assumes the classifier behaves normally (the default mock mode) — see
      // the 'classifier-degraded' project below, the only one that spec should ever run under.
      testIgnore: /classifier-degraded\.spec\.ts$/,
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
      testIgnore: /classifier-degraded\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] }
    },
    // [R7] A dedicated server + project, not a mode toggle inside the main suite: this is the
    // only project running against a server that was booted with CLASSIFIER_MODE=http and an
    // unreachable CLASSIFIER_SERVICE_URL, so screening.spec.ts's own "classifier offline" test
    // is the only spec that should ever run against it (every other spec assumes the classifier
    // behaves normally, matching the default mock mode) — see testMatch below.
    {
      name: 'classifier-degraded',
      testMatch: /classifier-degraded\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:3071',
        viewport: { width: 360, height: 740 },
        userAgent: devices['Galaxy S8'].userAgent,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: 'npm run preview -- --port 3071',
      url: 'http://localhost:3071',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: '3071',
        CLASSIFIER_MODE: 'http',
        // Deliberately unreachable (port 9 is a reserved/discard port, nothing ever listens
        // there) — a short timeout keeps the "offline" test itself fast rather than waiting out
        // CLASSIFIER_TIMEOUT_MS's own default.
        CLASSIFIER_SERVICE_URL: 'http://127.0.0.1:9',
        CLASSIFIER_TIMEOUT_MS: '500'
      }
    }
  ]
})
