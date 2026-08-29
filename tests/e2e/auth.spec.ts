// [FR1] Runs on the default 'mobile-360' project (playwright.config.ts). /login and /register
// previously had no link to each other — someone landing on /login with no account had no way
// forward through the UI at all, even though server/api/auth/register.post.ts has always
// supported a cold registration with no prior session. This covers the cross-link and the real
// registration round trip, including the server's own (deliberate, documented — see
// docs/security-controls.md's enumeration section) duplicate-email error surfacing inline rather
// than as a dead end.

import { expect, test } from '@playwright/test'

test('login and register cross-link to each other', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByRole('link', { name: 'Create one' }).click()
  await expect(page).toHaveURL('/register')
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible()

  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/login')
})

test('registering a fresh account signs the person in and lands them on the home page', async ({
  page
}) => {
  await page.goto('/register')
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.test`)
  await page.getByLabel('Password').fill('a-strong-password-1')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/')
  const session = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  expect(session.authenticated).toBe(true)
  expect(session.authMode).toBe('REGISTERED')
})

test('registering with an already-used email shows the server error, not a dead end', async ({
  page
}) => {
  const email = `e2e-dup-${Date.now()}@example.test`

  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-strong-password-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/')

  await page.context().clearCookies()
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-different-password-2')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toContainText('already exists')
  await expect(page).toHaveURL('/register')
})

test('a registered user completes a screening and views it in their history', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Email').fill(`e2e-history-${Date.now()}@example.test`)
  await page.getByLabel('Password').fill('a-strong-password-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/')

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
  const resultUrl = page.url()

  await page.getByRole('link', { name: 'View past check-ins' }).click()
  await expect(page).toHaveURL('/history')
  await expect(page.getByRole('heading', { name: 'Your check-ins' })).toBeVisible()

  const sessionId = resultUrl.split('/result/')[1]
  await expect(page.locator(`a[href="/result/${sessionId}"]`)).toBeVisible()
  await expect(page.getByText('MINIMAL', { exact: true })).toBeVisible()
})
