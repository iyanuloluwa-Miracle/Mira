// Integration coverage for prompt 7 (FR2, FR4, FR6, NFR3): the screening session API, against
// a real built server and a real (if ephemeral) Postgres — see
// tests/integration/helpers/test-server.ts for why.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { GAD7_ITEMS } from '../../server/domain/instruments/gad7'
import { PHQ9_ITEMS } from '../../server/domain/instruments/phq9'
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

const ALL_ITEM_CODES = [...PHQ9_ITEMS, ...GAD7_ITEMS].map((item) => item.itemCode)

function allItemsAtZero(): Record<string, number> {
  return Object.fromEntries(ALL_ITEM_CODES.map((itemCode) => [itemCode, 0]))
}

async function startAnonymousSession(): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, { method: 'POST' })
  return extractCookie(response)!
}

async function startScreening(cookie: string): Promise<{ sessionId: string }> {
  const response = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: { cookie }
  })
  expect(response.status).toBe(200)
  return response.json()
}

async function answerItem(
  cookie: string,
  sessionId: string,
  itemCode: string,
  rawValue: number
): Promise<Response> {
  return fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ itemCode, rawValue })
  })
}

async function answerAll(
  cookie: string,
  sessionId: string,
  values: Record<string, number>
): Promise<void> {
  for (const [itemCode, rawValue] of Object.entries(values)) {
    const response = await answerItem(cookie, sessionId, itemCode, rawValue)
    expect(response.status).toBe(200)
  }
}

async function submitFreeText(cookie: string, sessionId: string, text: string): Promise<Response> {
  return fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  })
}

async function skipFreeText(cookie: string, sessionId: string): Promise<Response> {
  return fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ skip: true })
  })
}

async function completeSession(cookie: string, sessionId: string): Promise<Response> {
  return fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
    method: 'POST',
    headers: { cookie }
  })
}

async function getResult(cookie: string, sessionId: string): Promise<Response> {
  return fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, { headers: { cookie } })
}

describe('POST /api/screening/start', () => {
  it('creates a COMBINED session and returns both instrument definitions', async () => {
    const cookie = await startAnonymousSession()
    const response = await fetch(`${server.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: { cookie }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.sessionId).toBeTruthy()
    expect(body.instruments.phq9.items).toHaveLength(9)
    expect(body.instruments.gad7.items).toHaveLength(7)
    expect(typeof body.serverTimeMs).toBe('number')

    const session = await prisma.screeningSession.findUnique({ where: { id: body.sessionId } })
    expect(session?.instrument).toBe('COMBINED')
    expect(session?.status).toBe('IN_PROGRESS')
  })

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/screening/start`, { method: 'POST' })
    expect(response.status).toBe(401)
  })
})

describe('full happy path', () => {
  it('start -> answer all items -> complete -> matches GET result -> appears in history', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    await answerAll(cookie, sessionId, allItemsAtZero())

    const completeResponse = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(completeResponse.status).toBe(200)
    const completed = await completeResponse.json()

    expect(completed.riskLevel).toBe('MINIMAL')
    expect(completed.phq9Total).toBe(0)
    expect(completed.gad7Total).toBe(0)
    expect(completed.escalated).toBe(false)
    expect(Array.isArray(completed.rationale)).toBe(true)
    expect(completed.rationale.length).toBeGreaterThan(0)
    expect(typeof completed.serverTimeMs).toBe('number')

    const resultResponse = await fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, {
      headers: { cookie }
    })
    const result = await resultResponse.json()
    expect(result.riskLevel).toBe('MINIMAL')
    expect(result.phq9Total).toBe(0)
    expect(result.gad7Total).toBe(0)

    const historyResponse = await fetch(`${server.baseUrl}/api/screening/history`, {
      headers: { cookie }
    })
    const history = await historyResponse.json()
    const entry = history.sessions.find((s: { sessionId: string }) => s.sessionId === sessionId)
    expect(entry).toBeDefined()
    expect(entry.status).toBe('COMPLETED')
    expect(entry.riskLevel).toBe('MINIMAL')
  })

  it('records serverLatencyMs on the session at completion (NFR3)', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())

    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
    expect(session?.serverLatencyMs).not.toBeNull()
    expect(session!.serverLatencyMs!).toBeGreaterThanOrEqual(0)
  })

  it('re-completing an already-completed session returns the same stored result, not a new one', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())

    const first = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const second = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const triageResults = await prisma.triageResult.findMany({ where: { sessionId } })
    expect(triageResults).toHaveLength(1)
  })
})

describe('partial completion is rejected', () => {
  it('returns 400 when items are missing', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const values = allItemsAtZero()
    delete values.PHQ9_Q9
    delete values.GAD7_Q3
    await answerAll(cookie, sessionId, values)

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(response.status).toBe(400)

    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
    expect(session?.status).toBe('IN_PROGRESS')
  })

  it('returns 400 completing a session with no answers at all', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(response.status).toBe(400)
  })
})

describe('ownership — cross-user access is forbidden', () => {
  it('returns 403 when another user tries to answer a session that is not theirs', async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId } = await startScreening(ownerCookie)

    const otherCookie = await startAnonymousSession()
    const response = await answerItem(otherCookie, sessionId, 'PHQ9_Q1', 1)
    expect(response.status).toBe(403)
  })

  it('returns 403 when another user tries to complete a session that is not theirs', async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId } = await startScreening(ownerCookie)
    await answerAll(ownerCookie, sessionId, allItemsAtZero())

    const otherCookie = await startAnonymousSession()
    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie: otherCookie }
    })
    expect(response.status).toBe(403)
  })

  it('returns 403 when another user tries to read a result that is not theirs', async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId } = await startScreening(ownerCookie)
    await answerAll(ownerCookie, sessionId, allItemsAtZero())
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie: ownerCookie }
    })

    const otherCookie = await startAnonymousSession()
    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, {
      headers: { cookie: otherCookie }
    })
    expect(response.status).toBe(403)
  })

  it("does not leak another user's sessions into history", async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId: ownerSessionId } = await startScreening(ownerCookie)

    const otherCookie = await startAnonymousSession()
    await startScreening(otherCookie)

    const response = await fetch(`${server.baseUrl}/api/screening/history`, {
      headers: { cookie: otherCookie }
    })
    const body = await response.json()
    const leaked = body.sessions.find((s: { sessionId: string }) => s.sessionId === ownerSessionId)
    expect(leaked).toBeUndefined()
  })
})

describe('DELETE /api/screening/[id]', () => {
  it('deletes the session and everything it cascades to', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}`, {
      method: 'DELETE',
      headers: { cookie }
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.deleted).toBe(true)

    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
    expect(session).toBeNull()
    const triageResult = await prisma.triageResult.findUnique({ where: { sessionId } })
    expect(triageResult).toBeNull()
    const responses = await prisma.itemResponse.findMany({ where: { sessionId } })
    expect(responses).toHaveLength(0)
  })

  it('also deletes an escalation row for a deleted CRISIS session', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 1 })
    const completeResponse = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const completed = await completeResponse.json()
    expect(completed.riskLevel).toBe('CRISIS')

    await fetch(`${server.baseUrl}/api/screening/${sessionId}`, {
      method: 'DELETE',
      headers: { cookie }
    })

    const escalations = await prisma.escalation.findMany({
      where: { triageResult: { sessionId } }
    })
    expect(escalations).toHaveLength(0)
  })

  it('returns 403 when another user tries to delete a session that is not theirs', async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId } = await startScreening(ownerCookie)

    const otherCookie = await startAnonymousSession()
    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}`, {
      method: 'DELETE',
      headers: { cookie: otherCookie }
    })
    expect(response.status).toBe(403)

    const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
    expect(session).not.toBeNull()
  })

  it('returns 404 for a session that does not exist', async () => {
    const cookie = await startAnonymousSession()
    const response = await fetch(
      `${server.baseUrl}/api/screening/00000000-0000-0000-0000-000000000000`,
      {
        method: 'DELETE',
        headers: { cookie }
      }
    )
    expect(response.status).toBe(404)
  })

  it('writes a SCREENING_SESSION_DELETED audit entry', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    await fetch(`${server.baseUrl}/api/screening/${sessionId}`, {
      method: 'DELETE',
      headers: { cookie }
    })

    const entries = await prisma.auditLog.findMany({
      where: {
        entityType: 'ScreeningSession',
        entityId: sessionId,
        action: 'SCREENING_SESSION_DELETED'
      }
    })
    expect(entries).toHaveLength(1)
  })
})

describe('idempotent answer replay', () => {
  it('upserts rather than duplicating when the same item is answered twice', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    await answerItem(cookie, sessionId, 'PHQ9_Q1', 1)
    await answerItem(cookie, sessionId, 'PHQ9_Q1', 3)

    const rows = await prisma.itemResponse.findMany({
      where: { sessionId, itemCode: 'PHQ9_Q1' }
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.rawValue).toBe(3)
  })
})

describe('item 9 positive -> CRISIS with an Escalation row', () => {
  it('produces a CRISIS result, escalated=true, and a PENDING Escalation row', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 1 })

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const body = await response.json()

    expect(body.riskLevel).toBe('CRISIS')
    expect(body.escalated).toBe(true)

    const triageResult = await prisma.triageResult.findUnique({ where: { sessionId } })
    expect(triageResult?.riskLevel).toBe('CRISIS')
    expect(triageResult?.escalated).toBe(true)

    const escalation = await prisma.escalation.findUnique({
      where: { triageResultId: triageResult!.id }
    })
    expect(escalation).not.toBeNull()
    expect(escalation?.status).toBe('PENDING')
  })

  it('produces CRISIS even when every score total would otherwise be MINIMAL', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 2 })

    const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const body = await response.json()
    expect(body.riskLevel).toBe('CRISIS')
  })
})

describe('audit logging', () => {
  it('writes a SCREENING_COMPLETED entry for every completion', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    const entries = await prisma.auditLog.findMany({
      where: { entityType: 'ScreeningSession', entityId: sessionId, action: 'SCREENING_COMPLETED' }
    })
    expect(entries).toHaveLength(1)
  })

  it('writes a CRISIS_RESULT_ACCESSED entry when a CRISIS result is read', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 1 })
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    await fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, { headers: { cookie } })

    const entries = await prisma.auditLog.findMany({
      where: {
        entityType: 'ScreeningSession',
        entityId: sessionId,
        action: 'CRISIS_RESULT_ACCESSED'
      }
    })
    expect(entries).toHaveLength(1)
  })

  it('does not write a CRISIS_RESULT_ACCESSED entry for a non-crisis result', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    await fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, { headers: { cookie } })

    const entries = await prisma.auditLog.findMany({
      where: {
        entityType: 'ScreeningSession',
        entityId: sessionId,
        action: 'CRISIS_RESULT_ACCESSED'
      }
    })
    expect(entries).toHaveLength(0)
  })
})

describe('POST /api/screening/[id]/text — submitting free text (FR3, R4, R5)', () => {
  it('encrypts the text so it is unreadable at rest', async () => {
    const marker = 'a very specific marker phrase that must never appear in plaintext anywhere'
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await submitFreeText(cookie, sessionId, marker)
    expect(response.status).toBe(200)

    const entry = await prisma.freeTextEntry.findFirstOrThrow({ where: { sessionId } })
    expect(entry.charCount).toBe(marker.length)
    expect(Buffer.from(entry.ciphertext).includes(Buffer.from(marker, 'utf8'))).toBe(false)
    // The whole database dump, not just this one row's ciphertext column, must not contain it.
    const raw = JSON.stringify(entry, (_key, value) =>
      value?.type === 'Buffer' ? Buffer.from(value.data).toString('latin1') : value
    )
    expect(raw).not.toContain(marker)
  })

  it('is idempotent — a retried submission after the first succeeded does not duplicate', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const first = await submitFreeText(cookie, sessionId, 'I feel hopeless today')
    const second = await submitFreeText(cookie, sessionId, 'I feel hopeless today')
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const entries = await prisma.freeTextEntry.findMany({ where: { sessionId } })
    expect(entries).toHaveLength(1)
    const predictions = await prisma.modelPrediction.findMany({ where: { sessionId } })
    expect(predictions).toHaveLength(1)
  })

  it('classifies the text and stores a ModelPrediction with topTokens', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await submitFreeText(cookie, sessionId, 'I feel hopeless and worthless')
    expect(response.status).toBe(200)

    const prediction = await prisma.modelPrediction.findFirstOrThrow({ where: { sessionId } })
    expect(prediction.modelVersion).toBe('mock-0.1')
    expect(prediction.predictedLabel).toBe('SYMPTOMATIC')
    expect(Array.isArray(prediction.topTokensJson)).toBe(true)
    expect((prediction.topTokensJson as unknown[]).length).toBeGreaterThan(0)
  })

  it('never lets the submitted text appear in any server log line', async () => {
    const marker = 'zzz-unique-log-marker-should-never-appear-zzz'
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await submitFreeText(cookie, sessionId, `I feel hopeless. ${marker}`)
    expect(response.status).toBe(200)

    expect(server.getOutput()).not.toContain(marker)
  })

  it('rejects text over the character limit', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await submitFreeText(cookie, sessionId, 'a'.repeat(2001))
    expect(response.status).toBe(400)
  })

  it('rejects an empty string', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const response = await submitFreeText(cookie, sessionId, '')
    expect(response.status).toBe(400)
  })

  it('requires the session to still be in progress', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await completeSession(cookie, sessionId)

    const response = await submitFreeText(cookie, sessionId, 'too late now')
    expect(response.status).toBe(400)
  })

  it("returns 403 for another user's session", async () => {
    const ownerCookie = await startAnonymousSession()
    const { sessionId } = await startScreening(ownerCookie)

    const otherCookie = await startAnonymousSession()
    const response = await submitFreeText(otherCookie, sessionId, 'not mine to write in')
    expect(response.status).toBe(403)
  })

  it('writes a FREE_TEXT_SUBMITTED audit entry without the text in its metadata', async () => {
    const marker = 'audit-marker-text'
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await submitFreeText(cookie, sessionId, marker)

    const entries = await prisma.auditLog.findMany({
      where: { entityType: 'ScreeningSession', entityId: sessionId, action: 'FREE_TEXT_SUBMITTED' }
    })
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries[0]!.metadataJson)).not.toContain(marker)
  })
})

describe('POST /api/screening/[id]/text — skipping (the per-session exclude setting)', () => {
  it('sets freeTextExcluded and is idempotent on retry', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    const first = await skipFreeText(cookie, sessionId)
    const second = await skipFreeText(cookie, sessionId)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const session = await prisma.screeningSession.findUniqueOrThrow({ where: { id: sessionId } })
    expect(session.freeTextExcluded).toBe(true)
  })

  it('leaves no FreeTextEntry or ModelPrediction behind', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await skipFreeText(cookie, sessionId)

    expect(await prisma.freeTextEntry.count({ where: { sessionId } })).toBe(0)
    expect(await prisma.modelPrediction.count({ where: { sessionId } })).toBe(0)
  })

  it('is a no-op if text is submitted after already skipping', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await skipFreeText(cookie, sessionId)

    const response = await submitFreeText(cookie, sessionId, 'changed my mind')
    expect(response.status).toBe(200)
    expect(await prisma.freeTextEntry.count({ where: { sessionId } })).toBe(0)
  })
})

describe('free text wired into triage on completion (FR3, R1)', () => {
  it('raises the risk level by exactly one step when free text is strongly SYMPTOMATIC', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)

    // PHQ9 10-14 with GAD7 at 0 lands rule-based MILD (server/domain/triage.ts).
    const values = allItemsAtZero()
    values.PHQ9_Q1 = 3
    values.PHQ9_Q2 = 3
    values.PHQ9_Q3 = 3
    values.PHQ9_Q4 = 2
    await answerAll(cookie, sessionId, values)

    // Several lexicon hits push MockClassifier's probability to (near-)1, well past the 0.85
    // HIGH-suggestion threshold — deliberately overshooting to prove the *cap* at one step.
    await submitFreeText(
      cookie,
      sessionId,
      'I feel hopeless and worthless, no point in anything, I want to give up completely'
    )

    const response = await completeSession(cookie, sessionId)
    const body = await response.json()

    expect(body.riskLevel).toBe('MODERATE') // MILD -> +1 step, not HIGH despite the model's strength
    expect(body.rationale.join(' ')).toMatch(/text-analysis|model/i)
  })

  it('does not raise the level when free text is classified NON_SYMPTOMATIC', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await submitFreeText(cookie, sessionId, 'the weather has been pleasant lately')

    const response = await completeSession(cookie, sessionId)
    const body = await response.json()

    expect(body.riskLevel).toBe('MINIMAL')
    expect(body.rationale.join(' ')).not.toMatch(/text-analysis|model/i)
  })

  it('never raises past HIGH even when already rule-based HIGH', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    const values = allItemsAtZero()
    values.PHQ9_Q1 = 3
    values.PHQ9_Q2 = 3
    values.PHQ9_Q3 = 3
    values.PHQ9_Q4 = 3
    values.PHQ9_Q5 = 3
    values.PHQ9_Q6 = 3
    values.PHQ9_Q7 = 2
    await answerAll(cookie, sessionId, values) // PHQ9 total 20 -> HIGH
    await submitFreeText(cookie, sessionId, 'hopeless worthless give up completely')

    const response = await completeSession(cookie, sessionId)
    const body = await response.json()
    expect(body.riskLevel).toBe('HIGH')
  })

  it('never overrides an item-9-triggered CRISIS, regardless of free text', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 1 })
    await submitFreeText(cookie, sessionId, 'actually feeling fine about everything')

    const response = await completeSession(cookie, sessionId)
    const body = await response.json()
    expect(body.riskLevel).toBe('CRISIS')
  })
})

describe('GET /api/screening/[id]/result — textAnalysis', () => {
  it('returns available spans that reconstruct the original text when free text was classified', async () => {
    const text = 'I feel hopeless and worthless today'
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await submitFreeText(cookie, sessionId, text)
    await completeSession(cookie, sessionId)

    const response = await getResult(cookie, sessionId)
    const body = await response.json()

    expect(body.textAnalysis.available).toBe(true)
    const spans: Array<{ text: string; highlighted: boolean }> = body.textAnalysis.spans
    expect(spans.map((s) => s.text).join('')).toBe(text)
    expect(spans.some((s) => s.highlighted)).toBe(true)
  })

  it('never includes the raw submitted text as its own field, only as span text', async () => {
    const text = 'I feel hopeless and worthless today'
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await submitFreeText(cookie, sessionId, text)
    await completeSession(cookie, sessionId)

    const response = await getResult(cookie, sessionId)
    const body = await response.json()
    expect(body.textAnalysis).not.toHaveProperty('text')
  })

  it('reports text-free when free text was explicitly skipped', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await skipFreeText(cookie, sessionId)
    await completeSession(cookie, sessionId)

    const response = await getResult(cookie, sessionId)
    const body = await response.json()
    expect(body.textAnalysis).toEqual({ available: false, reason: 'text-free' })
  })

  it('reports text-free when free text was never submitted at all', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, allItemsAtZero())
    await completeSession(cookie, sessionId)

    const response = await getResult(cookie, sessionId)
    const body = await response.json()
    expect(body.textAnalysis).toEqual({ available: false, reason: 'text-free' })
  })

  it('reports text-free for a CRISIS result even if free text was submitted', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await startScreening(cookie)
    await answerAll(cookie, sessionId, { ...allItemsAtZero(), PHQ9_Q9: 1 })
    await submitFreeText(cookie, sessionId, 'some text that will never be shown back')
    await completeSession(cookie, sessionId)

    const response = await getResult(cookie, sessionId)
    const body = await response.json()
    expect(body.riskLevel).toBe('CRISIS')
    expect(body.textAnalysis).toEqual({ available: false, reason: 'text-free' })
  })
})

// A separate server, deliberately misconfigured with an unreachable classifier — proves rule
// R7 against a real spawned process rather than mocking the classifier module out.
describe('graceful degradation — classifier unavailable at submission time (rule R7)', () => {
  let degradedServer: TestServer
  let degradedPrisma: PrismaClient

  beforeAll(async () => {
    degradedServer = await startTestServer({
      CLASSIFIER_MODE: 'http',
      CLASSIFIER_SERVICE_URL: 'http://127.0.0.1:1'
    })
    degradedPrisma = new PrismaClient({
      datasources: { db: { url: degradedServer.databaseUrl } }
    })
  }, 60_000)

  afterAll(async () => {
    await degradedPrisma?.$disconnect()
    await degradedServer?.stop()
  })

  async function startSession(): Promise<{ cookie: string; sessionId: string }> {
    const anon = await fetch(`${degradedServer.baseUrl}/api/auth/anonymous-start`, {
      method: 'POST'
    })
    const cookie = extractCookie(anon)!
    const started = await fetch(`${degradedServer.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: { cookie }
    })
    const { sessionId } = await started.json()
    return { cookie, sessionId }
  }

  it('still stores the free-text submission even though classification fails', async () => {
    const { cookie, sessionId } = await startSession()

    const response = await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/text`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'I feel hopeless today' })
    })
    expect(response.status).toBe(200)

    const entry = await degradedPrisma.freeTextEntry.findFirst({ where: { sessionId } })
    expect(entry).not.toBeNull()
    const prediction = await degradedPrisma.modelPrediction.findFirst({ where: { sessionId } })
    expect(prediction).toBeNull()
  })

  it('leaves a complete, unchanged-band session when the classifier is unreachable', async () => {
    const { cookie, sessionId } = await startSession()

    for (const item of [...PHQ9_ITEMS, ...GAD7_ITEMS]) {
      await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/answer`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ itemCode: item.itemCode, rawValue: 0 })
      })
    }
    await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/text`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hopeless worthless give up completely' })
    })

    const response = await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.riskLevel).toBe('MINIMAL') // unaffected — no signal reached triage at all
    expect(Array.isArray(body.rationale)).toBe(true)
    expect(body.rationale.length).toBeGreaterThan(0)
  })

  it('the result page reports the analysis was unavailable, not text-free', async () => {
    const { cookie, sessionId } = await startSession()
    for (const item of [...PHQ9_ITEMS, ...GAD7_ITEMS]) {
      await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/answer`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ itemCode: item.itemCode, rawValue: 0 })
      })
    }
    await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/text`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'some text the classifier never got to see' })
    })
    await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })

    const response = await fetch(`${degradedServer.baseUrl}/api/screening/${sessionId}/result`, {
      headers: { cookie }
    })
    const body = await response.json()
    expect(body.textAnalysis).toEqual({ available: false, reason: 'unavailable' })
  })
})
