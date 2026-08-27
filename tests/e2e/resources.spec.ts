// [FR5][NFR2] Runs on the default 'mobile-360' project (playwright.config.ts) — a real browser
// at a 360px viewport. Relies on the real content seeded via `npm run db:seed`
// (content/resources/*.md, ingested by prisma/seed.ts) rather than fixture data, since these
// pages have no test-only seam of their own.

import { expect, test } from '@playwright/test'

test('the resource library is reachable directly with no account and no screening session', async ({
  page
}) => {
  await page.goto('/resources')

  await expect(page.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Understanding Low Mood/ })).toBeVisible()
})

test('opening a resource shows its real rendered content and a working back link', async ({
  page
}) => {
  await page.goto('/resources')
  await page.getByRole('link', { name: /Understanding Low Mood/ }).click()

  await expect(page).toHaveURL(/\/resources\/understanding-low-mood/)
  await expect(
    page.getByRole('heading', { name: 'Understanding Low Mood', level: 1 })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Common signs', level: 2 })).toBeVisible()
  await expect(page.getByText('Source:')).toBeVisible()

  await page.getByRole('link', { name: 'All resources' }).click()
  await expect(page).toHaveURL(/\/resources$/)
})

test('the text-size control changes which size is active', async ({ page }) => {
  await page.goto('/resources/understanding-low-mood')

  const large = page.getByRole('button', { name: 'Large text' })
  const small = page.getByRole('button', { name: 'Small text' })

  await expect(page.getByRole('button', { name: 'Medium text' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  await large.click()
  await expect(large).toHaveAttribute('aria-pressed', 'true')

  await small.click()
  await expect(small).toHaveAttribute('aria-pressed', 'true')
  await expect(large).toHaveAttribute('aria-pressed', 'false')
})

test('a previously-visited resource remains readable after going offline', async ({
  page,
  context
}) => {
  // There is no service worker in this app (see the page's own header comment) — a hard
  // page reload while offline can't render anything at all, since the document itself has
  // nowhere cached to come from. What "readable offline" actually means here is a client-side
  // route change within an already-loaded session: visit once online (populates this page's
  // own localStorage cache), keep the app running, then navigate to it again after going
  // offline via a NuxtLink click rather than a reload.
  await page.goto('/resources/understanding-anxiety')
  await expect(page.getByRole('heading', { name: 'Understanding Anxiety', level: 1 })).toBeVisible()

  await page.goto('/resources')
  await expect(page.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible()

  await context.setOffline(true)
  await page.getByRole('link', { name: /Understanding Anxiety/ }).click()

  await expect(page.getByRole('heading', { name: 'Understanding Anxiety', level: 1 })).toBeVisible()
  await expect(page.getByText('viewing a saved copy', { exact: false })).toBeVisible()

  await context.setOffline(false)
})

test('an unvisited resource is not readable offline, and says so rather than hanging', async ({
  page
}) => {
  // Simulates "the app is loaded but this specific resource was never fetched successfully
  // before" by failing only its API call, not the whole page load — a full context.setOffline
  // before any navigation would fail the document load itself and prove nothing about this
  // page's own fallback behaviour.
  await page.route('**/api/resources/*', (route) => route.abort('internetdisconnected'))
  await page.goto('/resources/understanding-anxiety')

  await expect(page.getByText("We couldn't find that resource.")).toBeVisible()
})

async function completeScreening(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  for (let i = 0; i < 16; i++) {
    await page.getByRole('radio').first().check()
    await page.getByRole('button', { name: i === 15 ? 'Finish' : 'Next' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
  ).toBeVisible()
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect(page).toHaveURL(/\/result\//)
}

test('the result page shows real recommended resources that link to the library', async ({
  page
}) => {
  await completeScreening(page)

  await expect(page.getByRole('heading', { name: 'Next steps' })).toBeVisible()
  const firstResourceLink = page.locator('a[href^="/resources/"]').first()
  await expect(firstResourceLink).toBeVisible()

  await firstResourceLink.click()
  await expect(page).toHaveURL(/\/resources\/.+/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
