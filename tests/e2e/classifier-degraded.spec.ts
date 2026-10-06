// [FR3][NFR4][R7] Runs only on the 'classifier-degraded' project (playwright.config.ts), against a
// dedicated server booted with CLASSIFIER_MODE=http and an unreachable CLASSIFIER_SERVICE_URL —
// no other spec should ever run against this server, since every other spec assumes the
// classifier behaves normally (the default mock mode). Proves the rule R7 claim end to end, in
// a real browser: screening must complete successfully when the classifier is unreachable, and
// say so, never fail outright.

import { expect, test } from '@playwright/test'

test('a classifier that is unreachable still yields a complete result, degraded honestly', async ({
  page
}) => {
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
  await page.getByRole('textbox').fill('Writing something for the classifier to fail on.')
  await page.getByRole('button', { name: 'Continue' }).click()

  // The complete request must still succeed and land on a real result, not an error page —
  // this is the acceptance criterion itself.
  await expect(page).toHaveURL(/\/result\//)
  await expect(page.getByText(/Your answers suggest/)).toBeVisible()

  // And the degradation is stated honestly, not hidden.
  await expect(page.getByText('Text analysis was unavailable', { exact: false })).toBeVisible()
})
