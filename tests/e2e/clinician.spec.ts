// [FR6][FR7][NFR2] Runs on the default 'mobile-360' project (playwright.config.ts). Uses the
// real admin clinician account from prisma/seed.ts (admin@mira.local /
// change-me-before-any-real-use) rather than a test-only seam, since there is none for
// clinician accounts. A single browser context plays both roles in sequence — the person being
// screened, then the clinician reviewing the result — clearing cookies between the two so the
// mira_session and mira_clinician_session cookies are never both present at once, matching how
// two different people would actually use this.
//
// The clinician queue is read against a real, shared (non-ephemeral) database that accumulates
// escalations — including real CRISIS ones from screening.spec.ts's own CRISIS test — across
// every past run of the whole e2e suite. The queue correctly sorts CRISIS ahead of HIGH
// regardless of age, which means the first row in the UI is essentially never the HIGH
// escalation a given test just created. Every test below therefore creates its own escalation
// and then looks it up via latestHighEscalationId() (the API, filtered to HIGH) rather than
// reading queue position or scanning the whole accumulated list.

import { expect, test } from '@playwright/test'

async function completeHighRiskScreening(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  // PHQ-9 has 9 items; the fourth radio option (index 3, value 3, "Nearly every day") on every
  // item but item 9 (index 8, the self-harm item, left at "Not at all" to avoid the CRISIS
  // override) sums to 24 — past the HIGH threshold (phq9 >= 20) without ever touching CRISIS.
  for (let i = 0; i < 16; i++) {
    const options = page.getByRole('radio')
    await expect(options.first()).toBeVisible()
    await options.nth(i === 8 ? 0 : 3).check()
    await page.getByRole('button', { name: i === 15 ? 'Finish' : 'Next' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
  ).toBeVisible()
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect(page).toHaveURL(/\/result\//)
}

async function clinicianLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/clinician/login')
  await page.getByLabel('Email').fill('admin@mira.local')
  await page.getByLabel('Password').fill('change-me-before-any-real-use')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/clinician')
}

// The queue sorts CRISIS before HIGH regardless of age, and this suite's own e2e history
// (this file, and screening.spec.ts's CRISIS test) has left real CRISIS rows in the shared,
// non-ephemeral database — so a HIGH row this test just created is never page.locator(...).
// first() in the queue, and scanning the whole (ever-growing) list doesn't scale. Going
// straight to the API and picking the most-recently-created HIGH entry (escalations are
// returned oldest-first within a risk tier, so the last HIGH one is the newest) is fast and
// correct regardless of how much history has accumulated.
// Runs inside the page itself (not page.request, a separate APIRequestContext) so there is no
// question of whether the clinician session cookie is actually attached — it's the exact same
// fetch a real client-side click would make.
async function latestHighEscalationId(page: import('@playwright/test').Page): Promise<string> {
  const { escalations } = await page.evaluate(async () => {
    const response = await fetch('/api/clinician/escalations?status=PENDING')
    return (await response.json()) as { escalations: Array<{ id: string; riskLevel: string }> }
  })
  const highOnes = escalations.filter((e) => e.riskLevel === 'HIGH')
  expect(highOnes.length).toBeGreaterThan(0)
  return highOnes.at(-1)!.id
}

test('a HIGH-risk result shows the referral screen with clinician-visibility info and helplines', async ({
  page
}) => {
  await completeHighRiskScreening(page)

  await expect(
    page.getByRole('heading', { name: 'You may benefit from talking to someone' })
  ).toBeVisible()
  await expect(page.getByText('A pseudonym', { exact: false })).toBeVisible()
  await expect(page.getByText('Your name, email address', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share this with a clinician' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reach out directly' })).toBeVisible()
})

test('sharing with a clinician reaches the clinician queue and detail view', async ({
  page,
  context
}) => {
  await completeHighRiskScreening(page)
  await page.getByRole('button', { name: 'Share this with a clinician' }).click()
  await expect(
    page.getByText('Shared. Someone from our clinician team will follow up.')
  ).toBeVisible()

  await context.clearCookies()
  await clinicianLogin(page)

  await expect(page.getByRole('heading', { name: 'Escalation queue' })).toBeVisible()
  const id = await latestHighEscalationId(page)
  // A real client-side NuxtLink click, not page.goto — a bare page.goto to this route was
  // observed silently landing back on the queue instead of the detail view (most likely: a
  // goto forces a full browser navigation that re-runs SSR for the new route, and this app's
  // clinician-auth Nuxt middleware calling $fetch('/api/clinician/session') server-side does
  // not forward the incoming request's cookies unless told to). A click uses the app's own
  // already-authenticated client-side navigation instead, matching how a real clinician would
  // reach this page.
  await page.locator(`a[href="/clinician/escalations/${id}"]`).click()

  await expect(page.getByText('Pseudonym')).toBeVisible()
  await expect(page.getByText('Risk level')).toBeVisible()
  // exact: true — a plain substring match also matches "...20 or higher." in the rationale.
  await expect(page.getByText('HIGH', { exact: true })).toBeVisible()
})

test('a clinician can move a fresh escalation forward through statuses', async ({
  page,
  context
}) => {
  await completeHighRiskScreening(page)
  await page.getByRole('button', { name: 'Share this with a clinician' }).click()
  await expect(
    page.getByText('Shared. Someone from our clinician team will follow up.')
  ).toBeVisible()

  await context.clearCookies()
  await clinicianLogin(page)

  // Not on the queue page yet — a click needs the link to actually be in the DOM first.
  await page.goto('/clinician')
  const id = await latestHighEscalationId(page)
  await page.locator(`a[href="/clinician/escalations/${id}"]`).click()
  await expect(page.getByText('Current: Pending')).toBeVisible()

  const acknowledgeButton = page.getByRole('button', { name: 'Acknowledged' })
  await expect(acknowledgeButton).toBeVisible()
  await acknowledgeButton.click()
  await expect(page.getByText('Current: Acknowledged')).toBeVisible()
})

test('the clinician dashboard is unreachable without a clinician session', async ({ page }) => {
  await page.goto('/clinician')
  await expect(page).toHaveURL('/clinician/login')
})

test('a person-being-screened session cannot see the clinician queue', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  await page.goto('/clinician')
  await expect(page).toHaveURL('/clinician/login')
})
