// [NFR2] Runs on the default 'mobile-360' project (playwright.config.ts) — a real browser at a
// 360px viewport, the acceptance criterion this file exists to verify: the full screening flow
// is completable at that width, not just "should work in theory."

import { expect, test } from '@playwright/test'

test('landing page states the non-diagnostic disclaimer above the fold with two clear actions', async ({
  page
}) => {
  await page.goto('/')

  await expect(page.getByText('This is not a diagnosis.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start a private check' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

  // "Above the fold" on a 360x740 viewport: no scrolling needed to see the disclaimer.
  const box = await page.getByText('This is not a diagnosis.').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeLessThan(740)
})

test('completes the full PHQ-9 + GAD-7 flow at a 360px viewport and reaches a result', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()

  await expect(page).toHaveURL(/\/screen\//)

  // 16 items (9 PHQ-9 + 7 GAD-7): answer "Not at all" (the first, 0-value option) throughout,
  // so the run is deterministic and lands on MINIMAL rather than CRISIS.
  for (let i = 0; i < 16; i++) {
    await expect(page.getByRole('radio').first()).toBeVisible()
    await page.getByRole('radio').first().check()

    const isLast = i === 15
    await page.getByRole('button', { name: isLast ? 'Finish' : 'Next' }).click()
  }

  await expect(page.getByText('Screening complete')).toBeVisible()
  await expect(page.getByText(/risk level/)).toContainText('MINIMAL')
})

test('Next stays disabled until the current question is answered', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.getByRole('radio').first().check()
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled()
})

test('Back preserves the previously selected answer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  const options = page.getByRole('radio')
  await options.nth(2).check()
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(options.nth(2)).toBeChecked()
})

test('the safety exit button reaches the crisis page from the screening flow', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  await page.getByRole('link', { name: 'I need help now' }).click()
  await expect(page).toHaveURL('/support/crisis')
  await expect(page.getByRole('heading', { name: "You're not alone" })).toBeVisible()
})

test('the crisis page is reachable directly with no session at all', async ({ page }) => {
  await page.goto('/support/crisis')
  await expect(page.getByRole('heading', { name: "You're not alone" })).toBeVisible()
  await expect(page.getByText('Support contacts')).toBeVisible()
})
