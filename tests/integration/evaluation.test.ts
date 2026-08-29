// Integration coverage for the usability-evaluation instrumentation (Chapter Four, Section
// 3.8.3) — against a real built server and a real (if ephemeral) Postgres. Two servers: one with
// EVALUATION_MODE unset (the default, off) to prove the flag actually gates the feature, and one
// with it explicitly enabled to exercise the real start/event/end flow.
//
// Every mutating request needs a CSRF header now (server/middleware/csrf.ts) — it applies to
// every /api/* mutation regardless of whether the route itself requires a Mira user session, so
// even the unauthenticated POST /api/evaluation/event needs one. Each server gets its own
// seeded csrfCookie/csrfToken pair, matching tests/integration/privacy.test.ts's convention.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { extractCookie, extractCsrfToken } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let disabledServer: TestServer
let enabledServer: TestServer
let prisma: PrismaClient
let adminCookie: string
let disabledAdminCookie: string
let disabledCsrfCookie: string
let disabledCsrfToken: string
let enabledCsrfCookie: string
let enabledCsrfToken: string

function withDisabledCsrf(cookie?: string): { cookie: string; 'x-csrf-token': string } {
  return {
    cookie: cookie ? `${cookie}; ${disabledCsrfCookie}` : disabledCsrfCookie,
    'x-csrf-token': disabledCsrfToken
  }
}

function withEnabledCsrf(cookie?: string): { cookie: string; 'x-csrf-token': string } {
  return {
    cookie: cookie ? `${cookie}; ${enabledCsrfCookie}` : enabledCsrfCookie,
    'x-csrf-token': enabledCsrfToken
  }
}

async function seedAdmin(
  baseServer: TestServer,
  dbUrl: string,
  csrfHeaders: { cookie: string; 'x-csrf-token': string }
): Promise<string> {
  const client = new PrismaClient({ datasources: { db: { url: dbUrl } } })
  const passwordHash = await argon2.hash('a-strong-clinician-password', { type: argon2.argon2id })
  await client.clinician.create({
    data: {
      email: 'admin@example.test',
      passwordHash,
      fullName: 'Test Admin',
      role: 'ADMIN',
      isActive: true
    }
  })
  await client.$disconnect()

  const response = await fetch(`${baseServer.baseUrl}/api/clinician/login`, {
    method: 'POST',
    headers: { ...csrfHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'a-strong-clinician-password' })
  })
  return extractCookie(response)!
}

beforeAll(async () => {
  disabledServer = await startTestServer()
  enabledServer = await startTestServer({ EVALUATION_MODE: 'true' })
  prisma = new PrismaClient({ datasources: { db: { url: enabledServer.databaseUrl } } })

  const disabledSeed = await fetch(`${disabledServer.baseUrl}/api/auth/session`)
  disabledCsrfCookie = extractCookie(disabledSeed)!
  disabledCsrfToken = extractCsrfToken(disabledSeed)!

  const enabledSeed = await fetch(`${enabledServer.baseUrl}/api/auth/session`)
  enabledCsrfCookie = extractCookie(enabledSeed)!
  enabledCsrfToken = extractCsrfToken(enabledSeed)!

  disabledAdminCookie = await seedAdmin(
    disabledServer,
    disabledServer.databaseUrl,
    withDisabledCsrf()
  )
  adminCookie = await seedAdmin(enabledServer, enabledServer.databaseUrl, withEnabledCsrf())
}, 90_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await disabledServer?.stop()
  await enabledServer?.stop()
})

describe('the flag actually gates the feature', () => {
  it('refuses to start an evaluation session when EVALUATION_MODE is not enabled', async () => {
    const response = await fetch(`${disabledServer.baseUrl}/api/admin/evaluation/start`, {
      method: 'POST',
      headers: { ...withDisabledCsrf(disabledAdminCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ participantCode: 'P1', consented: true })
    })
    expect(response.status).toBe(403)
  })

  it('refuses to log an event when EVALUATION_MODE is not enabled', async () => {
    const response = await fetch(`${disabledServer.baseUrl}/api/evaluation/event`, {
      method: 'POST',
      headers: { ...withDisabledCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        evaluationSessionId: crypto.randomUUID(),
        type: 'SCREEN_TRANSITION',
        screen: '/'
      })
    })
    expect(response.status).toBe(403)
  })
})

describe('consent is a required, recorded fact — not an assumption (the second gate)', () => {
  it('rejects starting a session without explicit consent', async () => {
    const response = await fetch(`${enabledServer.baseUrl}/api/admin/evaluation/start`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(adminCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ participantCode: 'P-no-consent' })
    })
    expect(response.status).toBe(400)

    const session = await prisma.evaluationSession.findFirst({
      where: { participantCode: 'P-no-consent' }
    })
    expect(session).toBeNull()
  })

  it('requires an admin session, not just any clinician', async () => {
    const passwordHash = await argon2.hash('a-strong-clinician-password', { type: argon2.argon2id })
    await prisma.clinician.create({
      data: {
        email: 'plain-clinician@example.test',
        passwordHash,
        fullName: 'Plain Clinician',
        role: 'CLINICIAN',
        isActive: true
      }
    })
    const loginResponse = await fetch(`${enabledServer.baseUrl}/api/clinician/login`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'plain-clinician@example.test',
        password: 'a-strong-clinician-password'
      })
    })
    const clinicianCookie = extractCookie(loginResponse)!

    const response = await fetch(`${enabledServer.baseUrl}/api/admin/evaluation/start`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ participantCode: 'P-plain-clinician', consented: true })
    })
    expect(response.status).toBe(403)
  })
})

describe('the real start -> event -> end flow', () => {
  it('starts a session with a recorded consentedAt, logs events, and stops accepting them once ended', async () => {
    const startResponse = await fetch(`${enabledServer.baseUrl}/api/admin/evaluation/start`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(adminCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ participantCode: 'P2', consented: true })
    })
    expect(startResponse.status).toBe(200)
    const { id } = await startResponse.json()

    const stored = await prisma.evaluationSession.findUniqueOrThrow({ where: { id } })
    expect(stored.consentedAt).not.toBeNull()
    expect(stored.participantCode).toBe('P2')
    expect(stored.endedAt).toBeNull()

    const events: Array<Record<string, unknown>> = [
      { evaluationSessionId: id, type: 'SCREEN_TRANSITION', screen: '/' },
      { evaluationSessionId: id, type: 'TASK_START', taskId: 'task-1' },
      { evaluationSessionId: id, type: 'BACK_NAVIGATION', screen: '/screen/abc' },
      { evaluationSessionId: id, type: 'ERROR_ENCOUNTERED', screen: '/login' },
      { evaluationSessionId: id, type: 'TASK_END', taskId: 'task-1', completed: true }
    ]
    for (const body of events) {
      const response = await fetch(`${enabledServer.baseUrl}/api/evaluation/event`, {
        method: 'POST',
        headers: { ...withEnabledCsrf(), 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      expect(response.status).toBe(200)
    }

    const recorded = await prisma.evaluationEvent.findMany({ where: { evaluationSessionId: id } })
    expect(recorded.length).toBe(5)
    expect(recorded.map((e) => e.type).sort()).toEqual(
      ['SCREEN_TRANSITION', 'TASK_START', 'BACK_NAVIGATION', 'ERROR_ENCOUNTERED', 'TASK_END'].sort()
    )

    const endResponse = await fetch(`${enabledServer.baseUrl}/api/admin/evaluation/${id}/end`, {
      method: 'POST',
      headers: withEnabledCsrf(adminCookie)
    })
    expect(endResponse.status).toBe(200)

    const afterEnd = await prisma.evaluationSession.findUniqueOrThrow({ where: { id } })
    expect(afterEnd.endedAt).not.toBeNull()

    const rejectedResponse = await fetch(`${enabledServer.baseUrl}/api/evaluation/event`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({ evaluationSessionId: id, type: 'SCREEN_TRANSITION', screen: '/' })
    })
    expect(rejectedResponse.status).toBe(400)
  })

  it('rejects an event for an unknown evaluation session id', async () => {
    const response = await fetch(`${enabledServer.baseUrl}/api/evaluation/event`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        evaluationSessionId: crypto.randomUUID(),
        type: 'SCREEN_TRANSITION',
        screen: '/'
      })
    })
    expect(response.status).toBe(404)
  })

  it('never accepts a field that could hold free text (strict schema)', async () => {
    const startResponse = await fetch(`${enabledServer.baseUrl}/api/admin/evaluation/start`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(adminCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ participantCode: 'P3', consented: true })
    })
    const { id } = await startResponse.json()

    const response = await fetch(`${enabledServer.baseUrl}/api/evaluation/event`, {
      method: 'POST',
      headers: { ...withEnabledCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        evaluationSessionId: id,
        type: 'SCREEN_TRANSITION',
        screen: '/',
        freeText: 'this key does not exist on the schema'
      })
    })
    expect(response.status).toBe(400)
  })
})
