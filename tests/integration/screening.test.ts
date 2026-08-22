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
