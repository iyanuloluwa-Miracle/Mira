// [NFR3] Integration coverage for latency instrumentation (server/utils/metrics.ts) — against a
// real built server and a real (if ephemeral) Postgres. Covers exactly the prompt's acceptance
// criterion: a completed screening produces latency rows, plus the client-timing endpoint and
// the admin percentile/triage-distribution summary those rows feed.
//
// Every mutating request needs a CSRF header now (server/middleware/csrf.ts) — csrfCookie/
// csrfToken are seeded once in beforeAll and reused everywhere via withCsrf(), matching
// tests/integration/privacy.test.ts's own convention.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { GAD7_ITEMS } from '../../server/domain/instruments/gad7'
import { PHQ9_ITEM_NINE_CODE, PHQ9_ITEMS } from '../../server/domain/instruments/phq9'
import { extractCookie, extractCsrfToken } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let server: TestServer
let prisma: PrismaClient
let clinicianCookie: string
let adminCookie: string
let csrfCookie: string
let csrfToken: string

function withCsrf(cookie?: string): { cookie: string; 'x-csrf-token': string } {
  return { cookie: cookie ? `${cookie}; ${csrfCookie}` : csrfCookie, 'x-csrf-token': csrfToken }
}

async function clinicianLogin(email: string): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/clinician/login`, {
    method: 'POST',
    headers: { ...withCsrf(), 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-strong-clinician-password' })
  })
  return extractCookie(response)!
}

beforeAll(async () => {
  server = await startTestServer()
  prisma = new PrismaClient({ datasources: { db: { url: server.databaseUrl } } })

  const seed = await fetch(`${server.baseUrl}/api/auth/session`)
  csrfCookie = extractCookie(seed)!
  csrfToken = extractCsrfToken(seed)!

  const passwordHash = await argon2.hash('a-strong-clinician-password', { type: argon2.argon2id })
  await prisma.clinician.createMany({
    data: [
      {
        email: 'clinician@example.test',
        passwordHash,
        fullName: 'Test Clinician',
        role: 'CLINICIAN',
        isActive: true
      },
      {
        email: 'admin@example.test',
        passwordHash,
        fullName: 'Test Admin',
        role: 'ADMIN',
        isActive: true
      }
    ]
  })
  clinicianCookie = await clinicianLogin('clinician@example.test')
  adminCookie = await clinicianLogin('admin@example.test')
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await server?.stop()
})

async function userCookie(): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
    method: 'POST',
    headers: withCsrf()
  })
  return extractCookie(response)!
}

function highRiskAnswers(): Record<string, number> {
  const values: Record<string, number> = {}
  for (const item of PHQ9_ITEMS)
    values[item.itemCode] = item.itemCode === PHQ9_ITEM_NINE_CODE ? 0 : 3
  for (const item of GAD7_ITEMS) values[item.itemCode] = 0
  return values
}

async function startAndAnswer(cookie: string): Promise<string> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })
  const { sessionId } = await started.json()
  for (const [itemCode, rawValue] of Object.entries(highRiskAnswers())) {
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ itemCode, rawValue })
    })
  }
  return sessionId
}

describe('screening completion produces latency rows (NFR3 acceptance criterion)', () => {
  it('records a screening_complete_server_ms metric tied to the session', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    expect(response.status).toBe(200)

    const metrics = await prisma.metric.findMany({
      where: { name: 'screening_complete_server_ms', sessionId }
    })
    expect(metrics.length).toBe(1)
    expect(metrics[0]!.valueMs).toBeGreaterThanOrEqual(0)
  })

  it('does not record a duplicate metric when completion is re-requested (cache-read path)', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)

    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })

    const metrics = await prisma.metric.findMany({
      where: { name: 'screening_complete_server_ms', sessionId }
    })
    expect(metrics.length).toBe(1)
  })
})

describe('free-text submission produces classifier-call latency rows', () => {
  it('records both the server and e2e classifier metrics', async () => {
    const cookie = await userCookie()
    const started = await fetch(`${server.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    const { sessionId } = await started.json()

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Something for the classifier to look at.' })
    })
    expect(response.status).toBe(200)

    const serverMetrics = await prisma.metric.findMany({
      where: { name: 'classifier_call_server_ms', sessionId }
    })
    expect(serverMetrics.length).toBe(1)

    // The mock classifier (CLASSIFIER_MODE=mock, the test-server default) always succeeds, so
    // the e2e metric is expected here too.
    const e2eMetrics = await prisma.metric.findMany({
      where: { name: 'classifier_call_e2e_ms', sessionId }
    })
    expect(e2eMetrics.length).toBe(1)
  })

  it('does not record a classifier metric when the step is skipped', async () => {
    const cookie = await userCookie()
    const started = await fetch(`${server.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    const { sessionId } = await started.json()

    await fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ skip: true })
    })

    const metrics = await prisma.metric.findMany({
      where: { name: { in: ['classifier_call_server_ms', 'classifier_call_e2e_ms'] }, sessionId }
    })
    expect(metrics.length).toBe(0)
  })
})

describe('a conversation turn produces LLM-turn latency rows', () => {
  it('records both the server and e2e metrics for a real (mock) LLM call', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })

    const response = await fetch(`${server.baseUrl}/api/conversation/${sessionId}/message`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Can you explain my result a bit more?' })
    })
    expect(response.status).toBe(200)

    const serverMetrics = await prisma.metric.findMany({
      where: { name: 'llm_turn_server_ms', sessionId }
    })
    expect(serverMetrics.length).toBe(1)

    const e2eMetrics = await prisma.metric.findMany({
      where: { name: 'llm_turn_e2e_ms', sessionId }
    })
    expect(e2eMetrics.length).toBe(1)
  })
})

describe('client-reported round-trip metric (POST /api/metrics/client)', () => {
  it('records the e2e metric and updates ScreeningSession.clientLatencyMs', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })

    const response = await fetch(`${server.baseUrl}/api/metrics/client`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'screening_complete', valueMs: 842, sessionId })
    })
    expect(response.status).toBe(200)

    const metric = await prisma.metric.findFirst({
      where: { name: 'screening_complete_e2e_ms', sessionId }
    })
    expect(metric?.valueMs).toBe(842)

    const session = await prisma.screeningSession.findUniqueOrThrow({ where: { id: sessionId } })
    expect(session.clientLatencyMs).toBe(842)
  })

  it('rejects a name outside the allowlist', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)

    const response = await fetch(`${server.baseUrl}/api/metrics/client`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'anything_goes', valueMs: 100, sessionId })
    })
    expect(response.status).toBe(400)
  })

  it("rejects a session id belonging to someone else's session", async () => {
    const ownerCookie = await userCookie()
    const sessionId = await startAndAnswer(ownerCookie)

    const otherCookie = await userCookie()
    const response = await fetch(`${server.baseUrl}/api/metrics/client`, {
      method: 'POST',
      headers: { ...withCsrf(otherCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'screening_complete', valueMs: 100, sessionId })
    })
    expect(response.status).toBe(403)
  })

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/metrics/client`, {
      method: 'POST',
      headers: { ...withCsrf(), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'screening_complete',
        valueMs: 100,
        sessionId: crypto.randomUUID()
      })
    })
    expect(response.status).toBe(401)
  })
})

describe('GET /api/admin/metrics — the direct, queryable NFR3 evidence', () => {
  it('returns per-operation percentiles and counts, and the triage-band distribution', async () => {
    const cookie = await userCookie()
    const sessionId = await startAndAnswer(cookie)
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })

    const response = await fetch(`${server.baseUrl}/api/admin/metrics`, {
      headers: { cookie: adminCookie }
    })
    expect(response.status).toBe(200)
    const body = await response.json()

    const row = body.latency.find(
      (r: { name: string }) => r.name === 'screening_complete_server_ms'
    )
    expect(row).toBeDefined()
    expect(row.count).toBeGreaterThanOrEqual(1)
    expect(row.p50Ms).not.toBeNull()
    expect(row.p95Ms).not.toBeNull()
    expect(row.p99Ms).not.toBeNull()

    const highRow = body.triageDistribution.find(
      (r: { riskLevel: string }) => r.riskLevel === 'HIGH'
    )
    expect(highRow).toBeDefined()
    expect(highRow.count).toBeGreaterThanOrEqual(1)
  })

  it('a plain clinician cannot reach it', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/metrics`, {
      headers: { cookie: clinicianCookie }
    })
    expect(response.status).toBe(403)
  })

  it('requires a clinician session', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/metrics`)
    expect(response.status).toBe(401)
  })
})
