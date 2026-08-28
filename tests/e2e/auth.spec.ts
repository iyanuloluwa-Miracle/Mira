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
