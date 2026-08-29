// [NFR3] Runs on the default 'mobile-360' project (playwright.config.ts). Uses the real admin
// clinician account from prisma/seed.ts (admin@mira.local / change-me-before-any-real-use),
// same as clinician.spec.ts. Completes a real screening first so the latency section has
// guaranteed evidence to render, rather than assuming another spec already produced some.

import { expect, test } from '@playwright/test'

async function completeAScreening(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  for (let i = 0; i < 16; i++) {
    const options = page.getByRole('radio')
    await expect(options.first()).toBeVisible()
    await options.first().check()
    await page.getByRole('button', { name: i === 15 ? 'Finish' : 'Next' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
  ).toBeVisible()
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect(page).toHaveURL(/\/result\//)
}

async function adminLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/clinician/login')
  await page.getByLabel('Email').fill('admin@mira.local')
  await page.getByLabel('Password').fill('change-me-before-any-real-use')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/clinician')
}

test('the metrics page renders latency and triage-distribution charts for an admin', async ({
  page,
  context
}) => {
  await completeAScreening(page)
  await context.clearCookies()
  await adminLogin(page)

  // A real client-side NuxtLink click, not page.goto — see clinician.spec.ts's own comment: a
  // bare goto to an admin-gated route was observed silently bouncing back because the
  // clinician-auth middleware's server-side session check doesn't forward the incoming
  // request's cookies on a full SSR navigation.
  await page.getByRole('link', { name: 'Metrics' }).click()
  await expect(page).toHaveURL('/admin/metrics')

  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Latency (ms)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Triage-band distribution' })).toBeVisible()
  await expect(page.getByText(/p50 \d+ms/).first()).toBeVisible()
})

test('the metrics page is unreachable without a clinician session', async ({ page }) => {
  await page.goto('/admin/metrics')
  await expect(page).toHaveURL('/clinician/login')
})
