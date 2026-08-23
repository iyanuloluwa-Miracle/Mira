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

// Answers every item "Not at all" (the first, 0-value option), optionally overriding one item
// by its 0-based position in the combined 16-item PHQ-9 + GAD-7 order, then finishes and lands
// on the result page.
async function completeScreening(
  page: import('@playwright/test').Page,
  overrides: Record<number, number> = {}
): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  for (let i = 0; i < 16; i++) {
    const options = page.getByRole('radio')
    await expect(options.first()).toBeVisible()
    await options.nth(overrides[i] ?? 0).check()

    const isLast = i === 15
    await page.getByRole('button', { name: isLast ? 'Finish' : 'Next' }).click()
  }

  await expect(page).toHaveURL(/\/result\//)
}

test('completes the full PHQ-9 + GAD-7 flow at a 360px viewport and reaches a result', async ({
  page
}) => {
  // All items at 0 lands on MINIMAL rather than CRISIS — PHQ-9 item 9 (self-harm) is item
  // index 8 in the combined order and stays at its default "Not at all" here.
  await completeScreening(page)

  await expect(page.getByRole('heading', { name: /Your answers suggest/ })).toBeVisible()
  await expect(page.getByText('minimal symptoms of depression')).toBeVisible()
  await expect(page.getByText('minimal symptoms of anxiety')).toBeVisible()

  await expect(page.getByText('Depression (PHQ-9)')).toBeVisible()
  await expect(page.getByText('out of a possible 0–27')).toBeVisible()
  await expect(page.getByText('Anxiety (GAD-7)')).toBeVisible()
  await expect(page.getByText('out of a possible 0–21')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'How we got this result' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What this result is not' })).toBeVisible()
  await expect(page.getByText('This is not a diagnosis.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Next steps' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete this result' })).toBeVisible()
})

test('a CRISIS result interrupts the result page instead of showing scores', async ({ page }) => {
  // PHQ-9 item 9 (thoughts of self-harm) is item index 8 in the combined 16-item order —
  // answering it above "Not at all" forces CRISIS unconditionally (rule R2).
  await completeScreening(page, { 8: 1 })

  await expect(page.getByRole('heading', { name: "You're not alone" })).toBeVisible()
  await expect(page.getByText('Support contacts')).toBeVisible()

  // No scores or bands anywhere on this screen.
  await expect(page.getByText(/Your answers suggest/)).not.toBeVisible()
  await expect(page.getByText(/PHQ-9/)).not.toBeVisible()
  await expect(page.getByText(/GAD-7/)).not.toBeVisible()
})

test('deleting a result removes it and shows a confirmation', async ({ page }) => {
  await completeScreening(page)

  await page.getByRole('button', { name: 'Delete this result' }).click()
  await expect(page.getByText('This permanently deletes')).toBeVisible()

  await page.getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('This result has been deleted.')).toBeVisible()
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
