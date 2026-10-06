// [FR6][FR7][NFR1] Integration coverage for escalation and the clinician dashboard — against a real
// built server and a real (if ephemeral) Postgres. Covers exactly what the prompt's acceptance
// criteria ask for: role separation (a user session cannot reach /api/clinician and a clinician
// session cannot reach /api/screening), consent-gated visibility (both escalation-record
// creation and a clinician's free-text view), and an AuditLog entry on every clinician action.
//
// Clinician/admin login happens once each, in beforeAll, and every test reuses that cookie —
// clinicianAuthRateLimiter (server/utils/rate-limit.ts) allows 10 attempts per 15 minutes per
// hashed IP, and this file has far more than 10 assertions that need a clinician session.
//
// Every mutating request also needs a CSRF header now (server/middleware/csrf.ts) — csrfCookie/
// csrfToken are seeded once in beforeAll (the CSRF cookie is independent of which session, user
// or clinician, is otherwise active) and reused everywhere via withCsrf().

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

async function login(email: string): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/clinician/login`, {
    method: 'POST',
    headers: { ...withCsrf(), 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-strong-clinician-password' })
  })
  expect(response.status).toBe(200)
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

  clinicianCookie = await login('clinician@example.test')
  adminCookie = await login('admin@example.test')
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

// PHQ-9 items other than item 9 maxed out (>=20 total) with item 9 held at 0 (avoiding the
// CRISIS override) reliably lands on HIGH — the one non-CRISIS risk level that ever escalates.
function highRiskAnswers(): Record<string, number> {
  const values: Record<string, number> = {}
  for (const item of PHQ9_ITEMS)
    values[item.itemCode] = item.itemCode === PHQ9_ITEM_NINE_CODE ? 0 : 3
  for (const item of GAD7_ITEMS) values[item.itemCode] = 0
  return values
}

async function answerAll(cookie: string, sessionId: string, values: Record<string, number>) {
  for (const [itemCode, rawValue] of Object.entries(values)) {
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ itemCode, rawValue })
    })
  }
}

async function complete(
  cookie: string,
  sessionId: string
): Promise<{ sessionId: string; body: Record<string, unknown> }> {
  const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })
  const body = await response.json()
  return { sessionId, body }
}

async function completeHighRiskScreening(
  cookie: string
): Promise<{ sessionId: string; body: Record<string, unknown> }> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })
  const { sessionId } = await started.json()
  await answerAll(cookie, sessionId, highRiskAnswers())
  return complete(cookie, sessionId)
}

// Free text has to be submitted while the session is still IN_PROGRESS
// (server/api/screening/[id]/text.post.ts) — after complete.post.ts runs, the session is
// COMPLETED and a text submission is rejected, so this variant submits it first.
async function completeHighRiskScreeningWithFreeText(
  cookie: string,
  text: string
): Promise<{ sessionId: string; body: Record<string, unknown> }> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })
  const { sessionId } = await started.json()
  await answerAll(cookie, sessionId, highRiskAnswers())

  const textResponse = await fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
    method: 'POST',
    headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  })
  expect(textResponse.status).toBe(200)

  return complete(cookie, sessionId)
}

async function grantHumanReviewConsent(cookie: string): Promise<void> {
  const response = await fetch(`${server.baseUrl}/api/privacy/consent`, {
    method: 'POST',
    headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
    body: JSON.stringify({ purpose: 'HUMAN_REVIEW', granted: true, consentVersion: '1' })
  })
  expect(response.status).toBe(200)
}

async function withdrawHumanReviewConsent(cookie: string): Promise<void> {
  const response = await fetch(`${server.baseUrl}/api/privacy/consent`, {
    method: 'POST',
    headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
    body: JSON.stringify({ purpose: 'HUMAN_REVIEW', granted: false, consentVersion: '1' })
  })
  expect(response.status).toBe(200)
}

describe('role separation', () => {
  it('a user session cannot reach a clinician route', async () => {
    const cookie = await userCookie()
    const response = await fetch(`${server.baseUrl}/api/clinician/escalations`, {
      headers: { cookie }
    })
    expect(response.status).toBe(401)
  })

  it('a clinician session cannot reach a user route', async () => {
    const response = await fetch(`${server.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: withCsrf(clinicianCookie)
    })
    expect(response.status).toBe(401)
  })

  it('a plain clinician (non-admin) cannot reach admin resource management', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/resources`, {
      headers: { cookie: clinicianCookie }
    })
    expect(response.status).toBe(403)
  })

  it('an admin can reach admin resource management', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/resources`, {
      headers: { cookie: adminCookie }
    })
    expect(response.status).toBe(200)
  })
})

describe('consent-gated escalation record creation (FR6)', () => {
  it('does not create an Escalation row without prior HUMAN_REVIEW consent, but still reports escalated', async () => {
    const cookie = await userCookie()
    const { sessionId, body } = await completeHighRiskScreening(cookie)

    expect(body.riskLevel).toBe('HIGH')
    expect(body.escalated).toBe(true)
    expect(body.escalationRecorded).toBe(false)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUnique({
      where: { triageResultId: triageResult.id }
    })
    expect(escalation).toBeNull()
  })

  it('creates an Escalation row automatically when HUMAN_REVIEW consent is already active', async () => {
    const cookie = await userCookie()
    await grantHumanReviewConsent(cookie)
    const { sessionId, body } = await completeHighRiskScreening(cookie)

    expect(body.escalationRecorded).toBe(true)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUnique({
      where: { triageResultId: triageResult.id }
    })
    expect(escalation).not.toBeNull()
    expect(escalation!.status).toBe('PENDING')
  })

  it('lets the person opt in afterward via escalate.post.ts, and it is idempotent', async () => {
    const cookie = await userCookie()
    const { sessionId, body } = await completeHighRiskScreening(cookie)
    expect(body.escalationRecorded).toBe(false)

    const first = await fetch(`${server.baseUrl}/api/screening/${sessionId}/escalate`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    expect(first.status).toBe(200)
    expect((await first.json()).escalationRecorded).toBe(true)

    const second = await fetch(`${server.baseUrl}/api/screening/${sessionId}/escalate`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    expect(second.status).toBe(200)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalations = await prisma.escalation.findMany({
      where: { triageResultId: triageResult.id }
    })
    expect(escalations.length).toBe(1)

    const auditEntries = await prisma.auditLog.findMany({
      where: {
        entityType: 'Escalation',
        entityId: escalations[0]!.id,
        action: 'ESCALATION_CREATED'
      }
    })
    expect(auditEntries.length).toBe(1)
  })
})

describe('the escalation queue and detail view expose only a pseudonym (FR7 acceptance)', () => {
  it('never includes userId, email, or any identifier beyond the pseudonym', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreening(userSession)

    const queueResponse = await fetch(`${server.baseUrl}/api/clinician/escalations`, {
      headers: { cookie: clinicianCookie }
    })
    const { escalations } = await queueResponse.json()
    const row = escalations.find((e: { pseudonym: string }) => typeof e.pseudonym === 'string')
    expect(row).toBeDefined()
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain('userId')
    expect(serialized).not.toContain('email')

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })
    const detailResponse = await fetch(
      `${server.baseUrl}/api/clinician/escalations/${escalation.id}`,
      { headers: { cookie: clinicianCookie } }
    )
    const detail = await detailResponse.json()
    const detailKeys = Object.keys(detail)
    expect(detailKeys).not.toContain('userId')
    expect(detailKeys).not.toContain('email')
    expect(detail.pseudonym).toEqual(expect.any(String))
  })
})

describe('consent-gated free-text visibility in the clinician detail view (FR7, NFR1)', () => {
  it('shows free text when HUMAN_REVIEW consent is currently active', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreeningWithFreeText(
      userSession,
      'Things have been very difficult lately.'
    )

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    const detailResponse = await fetch(
      `${server.baseUrl}/api/clinician/escalations/${escalation.id}`,
      { headers: { cookie: clinicianCookie } }
    )
    const detail = await detailResponse.json()
    expect(detail.freeText.available).toBe(true)
    expect(detail.freeText.text).toBe('Things have been very difficult lately.')
  })

  it('withholds free text once consent is withdrawn, even though the Escalation row still exists', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreeningWithFreeText(
      userSession,
      'Something written before withdrawing consent.'
    )

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    await withdrawHumanReviewConsent(userSession)

    const detailResponse = await fetch(
      `${server.baseUrl}/api/clinician/escalations/${escalation.id}`,
      { headers: { cookie: clinicianCookie } }
    )
    const detail = await detailResponse.json()
    expect(detail.freeText.available).toBe(false)
    expect(detail.freeText.reason).toBe('withheld-by-consent')

    // The Escalation row itself is unaffected by the withdrawal — only the free text is gated.
    const stillExists = await prisma.escalation.findUnique({ where: { id: escalation.id } })
    expect(stillExists).not.toBeNull()
  })

  it('reports not-submitted, not withheld, when no free text was ever written', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreening(userSession)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    const detailResponse = await fetch(
      `${server.baseUrl}/api/clinician/escalations/${escalation.id}`,
      { headers: { cookie: clinicianCookie } }
    )
    const detail = await detailResponse.json()
    expect(detail.freeText.available).toBe(false)
    expect(detail.freeText.reason).toBe('not-submitted')
  })
})

describe('status transitions write an AuditLog entry every time, with the clinician id (FR7)', () => {
  it('moves PENDING -> ACKNOWLEDGED and audits it', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreening(userSession)
    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })
    const clinician = await prisma.clinician.findUniqueOrThrow({
      where: { email: 'clinician@example.test' }
    })

    const response = await fetch(`${server.baseUrl}/api/clinician/escalations/${escalation.id}`, {
      method: 'PATCH',
      headers: { ...withCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ACKNOWLEDGED' })
    })
    expect(response.status).toBe(200)

    const updated = await prisma.escalation.findUniqueOrThrow({ where: { id: escalation.id } })
    expect(updated.status).toBe('ACKNOWLEDGED')
    expect(updated.acknowledgedAt).not.toBeNull()
    expect(updated.clinicianId).toBe(clinician.id)

    const audit = await prisma.auditLog.findMany({
      where: {
        entityType: 'Escalation',
        entityId: escalation.id,
        action: 'ESCALATION_STATUS_CHANGED'
      }
    })
    expect(audit.length).toBe(1)
    expect(audit[0]!.actorType).toBe('CLINICIAN')
    expect(audit[0]!.actorId).toBe(clinician.id)
  })

  it('rejects a backward status transition', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreening(userSession)
    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    await fetch(`${server.baseUrl}/api/clinician/escalations/${escalation.id}`, {
      method: 'PATCH',
      headers: { ...withCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CONTACTED' })
    })

    const backward = await fetch(`${server.baseUrl}/api/clinician/escalations/${escalation.id}`, {
      method: 'PATCH',
      headers: { ...withCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING' })
    })
    expect(backward.status).toBe(400)
  })

  it('audits a notes update without putting the note content in the audit metadata', async () => {
    const userSession = await userCookie()
    await grantHumanReviewConsent(userSession)
    const { sessionId } = await completeHighRiskScreening(userSession)
    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    const response = await fetch(`${server.baseUrl}/api/clinician/escalations/${escalation.id}`, {
      method: 'PATCH',
      headers: { ...withCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Called the person, left a voicemail.' })
    })
    expect(response.status).toBe(200)

    const audit = await prisma.auditLog.findMany({
      where: {
        entityType: 'Escalation',
        entityId: escalation.id,
        action: 'ESCALATION_NOTE_UPDATED'
      }
    })
    expect(audit.length).toBe(1)
    expect(JSON.stringify(audit[0]!.metadataJson ?? {})).not.toContain('voicemail')

    const updated = await prisma.escalation.findUniqueOrThrow({ where: { id: escalation.id } })
    expect(updated.notesCiphertext).not.toBeNull()
  })
})

describe('admin resource management (FR7)', () => {
  it('an admin can create a resource, and the action is audited', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/resources`, {
      method: 'POST',
      headers: { ...withCsrf(adminCookie), 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Resource',
        slug: 'test-resource-integration',
        body: '# Test\n\nBody text.',
        language: 'en',
        tags: ['coping'],
        minRisk: 'MINIMAL',
        maxRisk: 'HIGH',
        readingTimeMinutes: 2,
        sourceAttribution: 'TODO_VERIFY: fixture'
      })
    })
    expect(response.status).toBe(200)
    const { id } = await response.json()

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Resource', entityId: id, action: 'RESOURCE_CREATED' }
    })
    expect(audit.length).toBe(1)
  })

  it('a plain clinician cannot create a resource', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/resources`, {
      method: 'POST',
      headers: { ...withCsrf(clinicianCookie), 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Should Fail',
        slug: 'should-fail',
        body: 'x',
        language: 'en',
        tags: ['coping'],
        minRisk: 'MINIMAL',
        maxRisk: 'HIGH',
        readingTimeMinutes: 1,
        sourceAttribution: 'TODO_VERIFY'
      })
    })
    expect(response.status).toBe(403)
  })
})

describe('clinician session absolute timeout (NFR1)', () => {
  it('rejects a clinician session past CLINICIAN_SESSION_ABSOLUTE_TTL_MS, even within its sliding window', async () => {
    // A throwaway login distinct from the shared clinicianCookie every other test in this file
    // depends on — this test backdates the row, which must not affect them.
    const throwawayCookie = await login('clinician@example.test')

    const stillValid = await fetch(`${server.baseUrl}/api/clinician/session`, {
      headers: { cookie: throwawayCookie }
    })
    expect((await stillValid.json()).authenticated).toBe(true)

    const mostRecentSession = await prisma.clinicianSession.findFirstOrThrow({
      orderBy: { createdAt: 'desc' }
    })
    await prisma.clinicianSession.update({
      where: { id: mostRecentSession.id },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }
    })

    const afterAbsoluteTimeout = await fetch(`${server.baseUrl}/api/clinician/session`, {
      headers: { cookie: throwawayCookie }
    })
    expect(await afterAbsoluteTimeout.json()).toEqual({ authenticated: false })

    // The shared clinicianCookie every other test uses is a different row, untouched.
    const sharedStillValid = await fetch(`${server.baseUrl}/api/clinician/session`, {
      headers: { cookie: clinicianCookie }
    })
    expect((await sharedStillValid.json()).authenticated).toBe(true)
  })
})
