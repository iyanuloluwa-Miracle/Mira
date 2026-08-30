// [FR2][FR7] Integration coverage for two routes an API-route audit found with zero coverage anywhere in
// this suite: GET /api/instruments/[code] (FR2 — instrument item text/response options) and
// POST /api/clinician/logout (FR7 — the clinician-realm counterpart to /api/auth/logout,
// already covered). Against a real built server and a real (if ephemeral) Postgres, same as
// every other file in this directory.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { extractCookie, extractCsrfToken } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let server: TestServer
let prisma: PrismaClient
let csrfCookie: string
let csrfToken: string

function withCsrf(cookie?: string): { cookie: string; 'x-csrf-token': string } {
  return { cookie: cookie ? `${cookie}; ${csrfCookie}` : csrfCookie, 'x-csrf-token': csrfToken }
}

beforeAll(async () => {
  server = await startTestServer()
  prisma = new PrismaClient({ datasources: { db: { url: server.databaseUrl } } })

  const seed = await fetch(`${server.baseUrl}/api/auth/session`)
  csrfCookie = extractCookie(seed)!
  csrfToken = extractCsrfToken(seed)!
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await server?.stop()
})

describe('GET /api/instruments/[code] (FR2)', () => {
  it('serves PHQ9 item text and response options', async () => {
    const response = await fetch(`${server.baseUrl}/api/instruments/PHQ9`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.length).toBe(9)
    expect(body.responseOptions.length).toBeGreaterThan(0)
  })

  it('serves GAD7 item text', async () => {
    const response = await fetch(`${server.baseUrl}/api/instruments/GAD7`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.length).toBe(7)
  })

  it('is case-insensitive on the code', async () => {
    const response = await fetch(`${server.baseUrl}/api/instruments/phq9`)
    expect(response.status).toBe(200)
  })

  it('404s on an unknown instrument code, not a raw error', async () => {
    const response = await fetch(`${server.baseUrl}/api/instruments/NOT_A_REAL_INSTRUMENT`)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.statusMessage).not.toContain('Prisma')
  })

  it('rejects a query string', async () => {
    const response = await fetch(`${server.baseUrl}/api/instruments/PHQ9?foo=bar`)
    expect(response.status).toBe(400)
  })
})

describe('POST /api/clinician/logout (FR7)', () => {
  it('ends the clinician session server-side, not just the cookie', async () => {
    const passwordHash = await argon2.hash('a-strong-clinician-password', { type: argon2.argon2id })
    await prisma.clinician.create({
      data: {
        email: 'logout-test@example.test',
        passwordHash,
        fullName: 'Logout Test',
        role: 'CLINICIAN',
        isActive: true
      }
    })
    const loginResponse = await fetch(`${server.baseUrl}/api/clinician/login`, {
      method: 'POST',
      headers: { ...withCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'logout-test@example.test',
        password: 'a-strong-clinician-password'
      })
    })
    const cookie = extractCookie(loginResponse)!

    const sessionBefore = await fetch(`${server.baseUrl}/api/clinician/session`, {
      headers: { cookie }
    })
    expect((await sessionBefore.json()).authenticated).toBe(true)

    const logoutResponse = await fetch(`${server.baseUrl}/api/clinician/logout`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    expect(logoutResponse.status).toBe(200)

    const sessionAfter = await fetch(`${server.baseUrl}/api/clinician/session`, {
      headers: { cookie }
    })
    expect((await sessionAfter.json()).authenticated).toBe(false)
  })

  it('is idempotent when called with no session', async () => {
    const response = await fetch(`${server.baseUrl}/api/clinician/logout`, {
      method: 'POST',
      headers: withCsrf()
    })
    expect(response.status).toBe(200)
  })
})
