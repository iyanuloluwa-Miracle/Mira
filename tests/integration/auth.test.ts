// Integration coverage for prompt 4 (FR1 + consent layer), against a real built server and a
// real (if ephemeral) Postgres — see tests/integration/helpers/test-server.ts for why.
//
// "Screening is reachable without registration" is tested at the boundary this prompt actually
// owns: that an anonymous session is fully authenticated and usable with no email or password
// ever supplied (rule R9). The screening API itself doesn't exist until prompt 7 — that prompt
// adds the end-to-end version of this check once there's an endpoint to call.

import { randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { extractCookie } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let server: TestServer
let prisma: PrismaClient

beforeAll(async () => {
  server = await startTestServer()
  prisma = new PrismaClient({ datasources: { db: { url: server.databaseUrl } } })
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await server?.stop()
})

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
}

// authRateLimiter (server/utils/rate-limit.ts) is one process-wide bucket per hashed IP, and
// every request in this file comes from the same loopback address — without this, one test's
// login attempts would eat into another, unrelated test's rate-limit budget. A fresh synthetic
// IP per test scenario keeps them independent, which also better reflects reality (distinct
// users have distinct IPs).
function uniqueIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`
}

describe('anonymous entry path (FR1, rule R9)', () => {
  it('creates a usable session with no email or password', async () => {
    const startResponse = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
      method: 'POST'
    })
    expect(startResponse.status).toBe(200)
    const started = await startResponse.json()
    expect(started.authMode).toBe('ANONYMOUS')
    expect(started.pseudonym).toMatch(/^[a-z]+-[a-z]+-\d{1,2}$/)

    const cookie = extractCookie(startResponse)
    expect(cookie).toBeDefined()

    const sessionResponse = await fetch(`${server.baseUrl}/api/auth/session`, {
      headers: { cookie: cookie! }
    })
    const session = await sessionResponse.json()

    expect(session).toEqual({
      authenticated: true,
      pseudonym: started.pseudonym,
      authMode: 'ANONYMOUS'
    })
  })

  it('is reachable with no session cookie at all — screening is never gated on auth', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/session`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false })
  })

  it('is idempotent: calling anonymous-start again with an existing session returns it unchanged', async () => {
    const first = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, { method: 'POST' })
    const cookie = extractCookie(first)!
    const firstBody = await first.json()

    const second = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
      method: 'POST',
      headers: { cookie }
    })
    const secondBody = await second.json()

    expect(secondBody).toEqual(firstBody)
  })
})

describe('registered entry path (FR1)', () => {
  it('registers, sets a session, and logs in with the same credentials', async () => {
    const ip = uniqueIp()
    const email = uniqueEmail('register')
    const password = 'correct-horse-battery-staple'

    const registerResponse = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password })
    })
    expect(registerResponse.status).toBe(200)
    const registered = await registerResponse.json()
    expect(registered.authMode).toBe('REGISTERED')

    const loginResponse = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password })
    })
    expect(loginResponse.status).toBe(200)
    const loggedIn = await loginResponse.json()
    expect(loggedIn.pseudonym).toBe(registered.pseudonym)
  })

  it('rejects a wrong password with a generic, non-enumerating error', async () => {
    const ip = uniqueIp()
    const email = uniqueEmail('wrongpass')
    await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'the-real-password-123' })
    })

    const wrongPasswordResponse = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'not-the-right-password' })
    })
    const unknownEmailResponse = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: uniqueEmail('nobody'), password: 'anything-at-all' })
    })

    expect(wrongPasswordResponse.status).toBe(401)
    expect(unknownEmailResponse.status).toBe(401)
    const [wrongPasswordBody, unknownEmailBody] = await Promise.all([
      wrongPasswordResponse.json(),
      unknownEmailResponse.json()
    ])
    expect(wrongPasswordBody.statusMessage).toBe(unknownEmailBody.statusMessage)
  })

  it('rejects registering the same email twice', async () => {
    const ip = uniqueIp()
    const email = uniqueEmail('dupe')
    const first = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'first-password-123' })
    })
    expect(first.status).toBe(200)

    const second = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'second-password-456' })
    })
    expect(second.status).toBe(409)
  })

  it('never stores the plaintext email anywhere in the users row', async () => {
    const email = uniqueEmail('plaintext-check')
    await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': uniqueIp() },
      body: JSON.stringify({ email, password: 'whatever-password-1' })
    })

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM users ORDER BY "createdAt" DESC LIMIT 1'
    )
    const dump = JSON.stringify(rows, (_key, value) =>
      value?.type === 'Buffer' ? Buffer.from(value.data).toString('base64') : value
    )
    expect(dump).not.toContain(email)
    expect(dump).not.toContain('plaintext-check')
  })

  it('rate limits repeated login attempts from the same IP', async () => {
    const ip = uniqueIp()
    const email = uniqueEmail('ratelimit')
    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email, password: 'guess-number-' + i })
      })
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })
})

describe('claiming an anonymous account (FR1, rule R9)', () => {
  it('preserves the pseudonym and prior consent history across the upgrade', async () => {
    const ip = uniqueIp()
    const startResponse = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
      method: 'POST'
    })
    const cookie = extractCookie(startResponse)!
    const { pseudonym: anonymousPseudonym } = await startResponse.json()

    const consentResponse = await fetch(`${server.baseUrl}/api/privacy/consent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'SCREENING', granted: true, consentVersion: 'v1' })
    })
    expect(consentResponse.status).toBe(200)

    const email = uniqueEmail('claim')
    const claimResponse = await fetch(`${server.baseUrl}/api/auth/claim-account`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, password: 'claim-account-password-1' })
    })
    expect(claimResponse.status).toBe(200)
    const claimed = await claimResponse.json()

    expect(claimed.pseudonym).toBe(anonymousPseudonym)
    expect(claimed.authMode).toBe('REGISTERED')

    const consentAfterClaim = await fetch(
      `${server.baseUrl}/api/privacy/consent?purpose=SCREENING`,
      { headers: { cookie } }
    )
    const consentState = await consentAfterClaim.json()
    expect(consentState.active).toBe(true)
    expect(consentState.consentVersion).toBe('v1')
  })

  it('refuses to claim an account with no active session', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/claim-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': uniqueIp() },
      body: JSON.stringify({ email: uniqueEmail('no-session'), password: 'irrelevant-1' })
    })
    expect(response.status).toBe(401)
  })
})

describe('consent recording (NFR1)', () => {
  async function startSession(): Promise<string> {
    const response = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, { method: 'POST' })
    return extractCookie(response)!
  }

  it('writes a consent record with the requested purpose and version', async () => {
    const cookie = await startSession()

    const response = await fetch(`${server.baseUrl}/api/privacy/consent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'SCREENING', granted: true, consentVersion: 'v2026-08-21' })
    })
    const body = await response.json()

    expect(body.purpose).toBe('SCREENING')
    expect(body.active).toBe(true)
    expect(body.consentVersion).toBe('v2026-08-21')
  })

  it('defaults research logging consent to inactive until explicitly granted', async () => {
    const cookie = await startSession()

    const response = await fetch(`${server.baseUrl}/api/privacy/consent?purpose=RESEARCH_LOGGING`, {
      headers: { cookie }
    })
    const body = await response.json()

    expect(body.active).toBe(false)
  })

  it('respects withdrawal: an active grant becomes inactive and keeps its withdrawnAt', async () => {
    const cookie = await startSession()

    await fetch(`${server.baseUrl}/api/privacy/consent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'RESEARCH_LOGGING', granted: true, consentVersion: 'v1' })
    })

    const withdrawResponse = await fetch(`${server.baseUrl}/api/privacy/consent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'RESEARCH_LOGGING', granted: false, consentVersion: 'v1' })
    })
    const withdrawn = await withdrawResponse.json()
    expect(withdrawn.active).toBe(false)
    expect(withdrawn.withdrawnAt).not.toBeNull()

    const stateResponse = await fetch(
      `${server.baseUrl}/api/privacy/consent?purpose=RESEARCH_LOGGING`,
      { headers: { cookie } }
    )
    const state = await stateResponse.json()
    expect(state.active).toBe(false)
    expect(state.withdrawnAt).not.toBeNull()
  })

  it('requires a session to record or read consent', async () => {
    const postResponse = await fetch(`${server.baseUrl}/api/privacy/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'SCREENING', granted: true, consentVersion: 'v1' })
    })
    expect(postResponse.status).toBe(401)

    const getResponse = await fetch(`${server.baseUrl}/api/privacy/consent?purpose=SCREENING`)
    expect(getResponse.status).toBe(401)
  })
})

describe('logout', () => {
  it('invalidates the session so it is no longer authenticated', async () => {
    const startResponse = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
      method: 'POST'
    })
    const cookie = extractCookie(startResponse)!

    const logoutResponse = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(logoutResponse.status).toBe(200)

    const sessionResponse = await fetch(`${server.baseUrl}/api/auth/session`, {
      headers: { cookie }
    })
    expect(await sessionResponse.json()).toEqual({ authenticated: false })
  })

  it('is idempotent when called with no session', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/logout`, { method: 'POST' })
    expect(response.status).toBe(200)
  })
})
