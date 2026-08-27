// [NFR1] Runs on the default 'mobile-360' project (playwright.config.ts), against the real
// dev/preview server and real (shared) database — same conventions as clinician.spec.ts. Covers
// what the prompt asked to be "demonstrable in a screenshot": the public notice, the "what is
// stored" summary, export, consent withdrawal taking immediate visible effect, and account
// deletion via the typed-pseudonym confirmation flow.

import { expect, test } from '@playwright/test'

async function completeScreeningWithFreeText(
  page: import('@playwright/test').Page,
  text: string
): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()
  await expect(page).toHaveURL(/\/screen\//)

  // Every item left at the first option ("Not at all") — MINIMAL risk, no CRISIS override, no
  // escalation. This test only needs a completed session and a written free-text entry to exist.
  for (let i = 0; i < 16; i++) {
    const options = page.getByRole('radio')
    await expect(options.first()).toBeVisible()
    await options.first().check()
    await page.getByRole('button', { name: i === 15 ? 'Finish' : 'Next' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
  ).toBeVisible()
  await page.getByRole('textbox').fill(text)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/result\//)
}

test('the public privacy notice is reachable with no session and links to the dashboard', async ({
  page
}) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your rights, and where to exercise them' })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How long we keep it' })).toBeVisible()

  await page.getByRole('link', { name: 'Go to your data' }).click()
  await expect(page).toHaveURL('/privacy/my-data')
})

test('the dashboard shows what is stored, exports it, withdraws consent, and deletes the account', async ({
  page
}) => {
  const noteText = 'A note this e2e run writes and then deletes.'
  await completeScreeningWithFreeText(page, noteText)

  await page.goto('/privacy/my-data')
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()

  const screeningRow = page.locator('li', { hasText: 'Screening sessions' })
  await expect(screeningRow.getByText('1', { exact: true })).toBeVisible()
  const freeTextRow = page.locator('li', { hasText: 'Written responses' })
  await expect(freeTextRow.getByText('1', { exact: true })).toBeVisible()

  // Export (right to data portability).
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data (JSON)' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('mira-my-data.json')

  // Consent withdrawal, immediate visible effect (the switch itself flips on click).
  const screeningSwitch = page.getByRole('switch').first()
  const before = await screeningSwitch.getAttribute('aria-checked')
  await screeningSwitch.click()
  await expect(screeningSwitch).toHaveAttribute(
    'aria-checked',
    before === 'true' ? 'false' : 'true'
  )

  // Deletion (right to erasure) — typed pseudonym confirmation, real cascade delete.
  const pseudonym = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session')
    return ((await response.json()) as { pseudonym: string }).pseudonym
  })

  await page.getByRole('button', { name: 'Delete my account' }).click()
  const confirmButton = page.getByRole('button', { name: 'Permanently delete' })
  await expect(confirmButton).toBeDisabled()

  await page.getByLabel(`Type your pseudonym (${pseudonym}) to confirm`).fill(pseudonym)
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('Your account and all linked data have been deleted.')).toBeVisible()

  const sessionAfterDelete = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session')
    return await response.json()
  })
  expect(sessionAfterDelete).toEqual({ authenticated: false })
})

test('the delete confirmation stays disabled for a non-matching pseudonym', async ({ page }) => {
  await page.goto('/privacy/my-data')
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByRole('textbox').last().fill('definitely-not-the-pseudonym')

  await expect(page.getByRole('button', { name: 'Permanently delete' })).toBeDisabled()
})
