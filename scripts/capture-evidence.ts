// Screenshots every key screen at a 360px mobile viewport into docs/screenshots/ for Chapter
// Four. Assumes `npm run demo` (or at minimum the base seed plus `tsx prisma/demo-seed.ts`) has
// already run against DATABASE_URL, and that the dev/preview server it seeded is already running
// at APP_BASE_URL — this script drives that live server, it doesn't start one itself. Most
// screens are captured by driving the real UI with the same interaction sequences already proven
// in tests/e2e/*.spec.ts (screening, conversation, clinician, privacy, metrics); the two
// clinician screens navigate straight to the fixed ids prisma/demo-seed.ts creates
// (prisma/demo-seed-ids.ts) rather than querying and filtering, since the queue can be cluttered
// with older data on a shared dev database.
//
// Fails loudly — non-zero exit, explicit list of what's missing — if any named screen wasn't
// captured, rather than silently producing a partial set.

import { chromium, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_IDS } from '../prisma/demo-seed-ids'

const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000'
const OUTPUT_DIR = join(process.cwd(), 'docs', 'screenshots')
const VIEWPORT = { width: 360, height: 740 }
const ADMIN_EMAIL = 'admin@mira.local'
const ADMIN_PASSWORD = 'change-me-before-any-real-use'

const EXPECTED_SCREENS = [
  'landing',
  'consent',
  'question',
  'result',
  'explanation',
  'crisis',
  'chat',
  'resources',
  'clinician-queue',
  'clinician-detail',
  'privacy-dashboard',
  'metrics'
] as const

const captured = new Set<string>()

async function capture(page: Page, name: (typeof EXPECTED_SCREENS)[number]): Promise<void> {
  await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`) })
  captured.add(name)
  console.log(`  captured ${name}.png`)
}

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`)
}

// Mirrors tests/e2e/screening.spec.ts's completeScreening helper: answers all 16 combined
// PHQ-9 + GAD-7 items (index 8 is PHQ-9 item 9 — the self-harm item), captures 'question'
// mid-flow, then either writes free text or skips it before landing on the result page.
async function completeScreening(
  page: Page,
  options: { overrides?: Record<number, number>; freeText?: string; captureQuestion?: boolean }
): Promise<string> {
  await goto(page, '/')
  await click(page, 'button', 'Start a private check')
  await page.waitForURL(/\/screen\//)

  for (let i = 0; i < 16; i++) {
    const radios = page.getByRole('radio')
    await radios.first().waitFor()
    await radios.nth(options.overrides?.[i] ?? 0).check({ force: true })
    if (options.captureQuestion && i === 0) await capture(page, 'question')
    await click(page, 'button', i === 15 ? 'Finish' : 'Next')
  }

  await page
    .getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
    .waitFor()
  if (options.freeText) {
    await page.getByRole('textbox').fill(options.freeText, { force: true })
    await click(page, 'button', 'Continue')
  } else {
    await click(page, 'button', /Skip/)
  }
  await page.waitForURL(/\/result\//)
  return page.url().split('/result/')[1]!
}

async function clinicianLogin(page: Page): Promise<void> {
  await goto(page, '/clinician/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL, { force: true })
  await page.getByLabel('Password').fill(ADMIN_PASSWORD, { force: true })
  await click(page, 'button', 'Sign in')
  await page.waitForURL(`${BASE_URL}/clinician`)
}

function readHistoryUserCookieValue(): string {
  const path = join(process.cwd(), 'scripts', '.demo-session-tokens.json')
  if (!existsSync(path)) {
    throw new Error(
      `${path} not found. Run the demo seed first (e.g. "npm run demo", or ` +
        '"tsx prisma/demo-seed.ts" against an already-seeded database).'
    )
  }
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { historyUser: { cookieValue: string } }
  return parsed.historyUser.cookieValue
}

// Nuxt dev mode (unlike the production build tests/e2e/ runs against) compiles each route and
// discovers new dependencies to pre-bundle on first request, which can make the first visit to
// any given route take well past Playwright's normal 30s default — a generous default here
// avoids a spurious timeout on an otherwise-working route.
async function newPage(browser: import('@playwright/test').Browser): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT })
  page.setDefaultTimeout(60_000)
  page.setDefaultNavigationTimeout(60_000)
  return page
}

// Dev mode runs vite-plugin-checker (the "[vue-tsc] ..." messages in `nuxt dev`'s own output),
// whose <vite-plugin-checker-error-overlay> custom element can be left in the DOM — invisible,
// but still intercepting every pointer event — even after it has nothing left to report. This
// never affects tests/e2e/, which runs against a production build with no such overlay; only
// this script, which the "run against the local dev server" requirement means must cope with it.
// `force: true` skips Playwright's actionability checks (including this overlay-intercept check)
// — acceptable here since this script only ever screenshots, it doesn't assert correctness.
async function click(page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp) {
  await page.getByRole(role, { name }).click({ force: true })
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch()

  // --- Screens with no session required -------------------------------------------------
  {
    const page = await newPage(browser)
    await goto(page, '/')
    await capture(page, 'landing')
    // No separate consent step exists in this MVP — the landing page's disclaimer is what a
    // person agrees to before starting (see app/pages/index.vue). Captured as its own figure
    // anyway, per the requested screenshot set, rather than silently reusing the landing image.
    await capture(page, 'consent')
    await page.close()
  }

  {
    const page = await newPage(browser)
    await goto(page, '/support/crisis')
    await capture(page, 'crisis')
    await page.close()
  }

  {
    const page = await newPage(browser)
    await goto(page, '/resources')
    await capture(page, 'resources')
    await page.close()
  }

  // --- Screening: question -> result -> explanation (one session, with free text) ---------
  {
    const page = await newPage(browser)
    await completeScreening(page, {
      captureQuestion: true,
      freeText: 'Synthetic evidence-capture response: things have felt a bit heavy lately.'
    })
    await capture(page, 'result')
    await page
      .getByRole('heading', { name: 'What your written answer showed' })
      .scrollIntoViewIfNeeded()
    await capture(page, 'explanation')
    await page.close()
  }

  // --- Chat (bounded conversational layer) -------------------------------------------------
  {
    const page = await newPage(browser)
    const sessionId = await completeScreening(page, {})
    await goto(page, `/support/${sessionId}`)
    await page.getByPlaceholder('Ask a question…').fill('What is depression?', { force: true })
    await click(page, 'button', 'Send')
    await page.getByText('Thanks for sharing that.', { exact: false }).waitFor()
    await capture(page, 'chat')
    await page.close()
  }

  // --- Metrics (needs at least one fresh, real completion for a latency figure) ------------
  {
    const page = await newPage(browser)
    await completeScreening(page, {})
    await page.context().clearCookies()
    await clinicianLogin(page)
    await click(page, 'link', 'Metrics')
    await page.waitForURL(`${BASE_URL}/admin/metrics`)
    await page.getByRole('heading', { name: 'Metrics' }).waitFor()
    await capture(page, 'metrics')
    await page.close()
  }

  // --- Clinician queue + detail (seeded escalations, fixed ids) ----------------------------
  {
    const page = await newPage(browser)
    await clinicianLogin(page)
    await page.getByRole('heading', { name: 'Escalation queue' }).waitFor()
    await capture(page, 'clinician-queue')

    await goto(page, `/clinician/escalations/${DEMO_IDS.highEscalated.escalationId}`)
    await page.getByRole('heading', { name: 'Status' }).waitFor()
    await capture(page, 'clinician-detail')
    await page.close()
  }

  // --- Privacy dashboard (seeded "user with history" — richer than a single fresh session) --
  {
    const page = await newPage(browser)
    await page.context().addCookies([
      {
        name: 'mira_session',
        value: readHistoryUserCookieValue(),
        domain: new URL(BASE_URL).hostname,
        path: '/'
      }
    ])
    await goto(page, '/privacy/my-data')
    await page.getByRole('heading', { name: 'Your data' }).waitFor()
    await capture(page, 'privacy-dashboard')
    await page.close()
  }

  await browser.close()

  const missing = EXPECTED_SCREENS.filter((name) => !captured.has(name))
  if (missing.length > 0) {
    console.error(`\nFAILED — missing screenshot(s): ${missing.join(', ')}`)
    process.exitCode = 1
    return
  }

  console.log(`\nAll ${EXPECTED_SCREENS.length} screenshots captured in ${OUTPUT_DIR}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
