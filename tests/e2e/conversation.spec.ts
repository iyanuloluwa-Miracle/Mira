// [FR3][NFR2] Runs on the default 'mobile-360' project (playwright.config.ts) — a real browser
// at a 360px viewport, the acceptance criterion this file exists to verify: the chat is fully
// usable there and the safety header stays visible with no scrolling. LLM_MODE is left at its
// default ("mock" — see config/runtime.ts), so every reply here is MockLlmClient's deterministic
// canned text (server/services/conversation/mock-client.ts), never a real, billed API call.

import { expect, test } from '@playwright/test'

async function completeScreeningToChat(
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
    await page.getByRole('button', { name: i === 15 ? 'Finish' : 'Next' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'In your own words, how have the last two weeks been?' })
  ).toBeVisible()
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect(page).toHaveURL(/\/result\//)

  const sessionId = page.url().split('/result/')[1]
  await page.goto(`/support/${sessionId}`)
}

test('the safety header and exit control are visible with no scrolling at 360px', async ({
  page
}) => {
  await completeScreeningToChat(page)

  await expect(page.getByText('Automated assistant for general information.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'I need help now' })).toBeVisible()

  const header = page.getByText('Automated assistant for general information.')
  const box = await header.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeLessThan(740)
})

test('shows suggested prompts before any message is sent, and sending one starts the conversation', async ({
  page
}) => {
  await completeScreeningToChat(page)

  await expect(page.getByRole('button', { name: 'What does my score mean?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'What is anxiety?' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'How do I talk to someone about this?' })
  ).toBeVisible()

  await page.getByRole('button', { name: 'What does my score mean?' }).click()

  await expect(page.getByText('What does my score mean?')).toBeVisible()
  await expect(page.getByText('Thanks for sharing that.', { exact: false })).toBeVisible()
})

test('typing a question and sending it replaces the suggested prompts with the reply', async ({
  page
}) => {
  await completeScreeningToChat(page)

  const input = page.getByPlaceholder('Ask a question…')
  await input.fill('What is depression?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('What is depression?')).toBeVisible()
  await expect(page.getByText('Thanks for sharing that.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'What is anxiety?' })).not.toBeVisible()
  await expect(input).toHaveValue('')
})

test('the crisis pre-filter interrupts the chat instead of calling the assistant', async ({
  page
}) => {
  await completeScreeningToChat(page)

  const input = page.getByPlaceholder('Ask a question…')
  await input.fill('I want to kill myself.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByRole('heading', { name: "You're not alone" })).toBeVisible()
  await expect(page.getByText('Support contacts')).toBeVisible()
  // No assistant chat bubble — the crisis screen replaces the conversation entirely.
  await expect(page.getByText('Thanks for sharing that.', { exact: false })).not.toBeVisible()
})

test('the chat page is reachable directly by URL for an already-completed session', async ({
  page
}) => {
  await completeScreeningToChat(page)
  const sessionId = page.url().split('/support/')[1]

  await page.goto(`/support/${sessionId}`)
  await expect(page.getByText('Automated assistant for general information.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'What does my score mean?' })).toBeVisible()
})

test('an unknown session id shows a clear error with a way back, not a stuck screen', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a private check' }).click()

  await page.goto('/support/00000000-0000-0000-0000-000000000000')

  await expect(page.getByText("We couldn't find that screening result.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Mira' })).toBeVisible()
})
