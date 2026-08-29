// Integration coverage for the bounded conversational layer (component 4, rule R6): the
// pre-filter short-circuit, the post-filter's effect on what's persisted, consent-gated
// transcript storage, and that plaintext never appears in a log line — against a real built
// server and a real (if ephemeral) Postgres. LLM_MODE is left at its default ("mock") so this
// suite never makes a real, billed API call — see server/domain/conversation-safety.test.ts
// for the adversarial suite proving the filters themselves.
//
// conversationRateLimiter (server/utils/rate-limit.ts) allows 10 calls per minute per hashed IP,
// and this file alone sends more than that across all its tests — every test gets its own
// synthetic x-forwarded-for IP (matching auth.test.ts's own uniqueIp() convention) so one test's
// message volume can't eat into another's budget.
//
// Every mutating request also needs a CSRF header now (server/middleware/csrf.ts) — csrfCookie/
// csrfToken are seeded once in beforeAll and reused everywhere via withCsrf().

import { randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { GAD7_ITEMS } from '../../server/domain/instruments/gad7'
import { PHQ9_ITEMS } from '../../server/domain/instruments/phq9'
import { extractCookie, extractCsrfToken } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let server: TestServer
let prisma: PrismaClient
let csrfCookie: string
let csrfToken: string

function withCsrf(cookie?: string): { cookie: string; 'x-csrf-token': string } {
  return { cookie: cookie ? `${cookie}; ${csrfCookie}` : csrfCookie, 'x-csrf-token': csrfToken }
}

function uniqueIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`
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

const ALL_ITEM_CODES = [...PHQ9_ITEMS, ...GAD7_ITEMS].map((item) => item.itemCode)

function allItemsAtZero(): Record<string, number> {
  return Object.fromEntries(ALL_ITEM_CODES.map((itemCode) => [itemCode, 0]))
}

async function startAnonymousSession(): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, {
    method: 'POST',
    headers: withCsrf()
  })
  return extractCookie(response)!
}

// Returns a fully completed screening session — the conversation endpoint requires one, since
// its only context is the triage result's band and rationale.
async function completedSession(cookie: string): Promise<string> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })
  const { sessionId } = await started.json()

  for (const [itemCode, rawValue] of Object.entries(allItemsAtZero())) {
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
      method: 'POST',
      headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ itemCode, rawValue })
    })
  }
  await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
    method: 'POST',
    headers: withCsrf(cookie)
  })

  return sessionId
}

async function sendMessage(
  cookie: string,
  sessionId: string,
  message: string,
  ip: string,
  priorMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<Response> {
  return fetch(`${server.baseUrl}/api/conversation/${sessionId}/message`, {
    method: 'POST',
    headers: { ...withCsrf(cookie), 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ message, priorMessages })
  })
}

async function grantResearchLoggingConsent(cookie: string): Promise<void> {
  await fetch(`${server.baseUrl}/api/privacy/consent`, {
    method: 'POST',
    headers: { ...withCsrf(cookie), 'content-type': 'application/json' },
    body: JSON.stringify({
      purpose: 'RESEARCH_LOGGING',
      granted: true,
      consentVersion: 'test-v1'
    })
  })
}

describe('POST /api/conversation/[sessionId]/message — pre-filter (rule R6, R7)', () => {
  it('short-circuits to static crisis content and never reaches the LLM', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    const response = await sendMessage(cookie, sessionId, 'I want to kill myself.', ip)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.kind).toBe('crisis')
    expect(body.helplines).toBeDefined()
    expect(body.message).not.toContain('sertraline') // sanity: not a model-generated string

    const turn = await prisma.conversationTurn.findFirstOrThrow({ where: { sessionId } })
    expect(turn.preFilterTriggered).toBe(true)
    expect(turn.preFilterReason).toBe('self-harm')
    // The clearest DB-level evidence the LLM was never called: no model identity recorded.
    expect(turn.modelName).toBe('n/a')
    expect(turn.modelVersion).toBe('n/a')
    expect(turn.promptTokens).toBe(0)
    expect(turn.completionTokens).toBe(0)
  })

  it('writes a CONVERSATION_PRE_FILTER_TRIGGERED audit entry with the reason but not the message', async () => {
    const ip = uniqueIp()
    const marker = 'zzz-should-never-appear-in-audit-zzz'
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    await sendMessage(cookie, sessionId, `I want to kill myself. ${marker}`, ip)

    const entries = await prisma.auditLog.findMany({
      where: {
        entityType: 'ScreeningSession',
        entityId: sessionId,
        action: 'CONVERSATION_PRE_FILTER_TRIGGERED'
      }
    })
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries[0]!.metadataJson)).not.toContain(marker)
    expect(JSON.stringify(entries[0]!.metadataJson)).toContain('self-harm')
  })

  it('never lets the triggering message appear in any server log line', async () => {
    const ip = uniqueIp()
    const marker = 'yyy-unique-crisis-log-marker-yyy'
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    await sendMessage(cookie, sessionId, `I want to kill myself. ${marker}`, ip)
    expect(server.getOutput()).not.toContain(marker)
  })
})

describe('POST /api/conversation/[sessionId]/message — the mock LLM path', () => {
  it('returns a reply and records the mock model version', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    const response = await sendMessage(cookie, sessionId, 'What does my score mean?', ip)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.kind).toBe('ok')
    expect(body.text.length).toBeGreaterThan(0)

    const turn = await prisma.conversationTurn.findFirstOrThrow({ where: { sessionId } })
    expect(turn.modelVersion).toBe('mock-conversation-0.1')
    expect(turn.preFilterTriggered).toBe(false)
    expect(turn.postFilterTriggered).toBe(false)
  })

  it('increments turnNumber across multiple messages in the same session', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    await sendMessage(cookie, sessionId, 'first message', ip)
    await sendMessage(cookie, sessionId, 'second message', ip)

    const turns = await prisma.conversationTurn.findMany({
      where: { sessionId },
      orderBy: { turnNumber: 'asc' }
    })
    expect(turns.map((t) => t.turnNumber)).toEqual([1, 2])
  })
})

describe('POST /api/conversation/[sessionId]/message — consent-gated transcript storage (rule R5)', () => {
  it('stores no transcript at all without RESEARCH_LOGGING consent', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    await sendMessage(cookie, sessionId, 'a message with no consent granted', ip)

    const turn = await prisma.conversationTurn.findFirstOrThrow({ where: { sessionId } })
    expect(turn.transcriptCiphertext).toBeNull()
  })

  it('stores an encrypted, unreadable transcript once consent is granted', async () => {
    const ip = uniqueIp()
    const marker = 'consented-transcript-marker-abc'
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)
    await grantResearchLoggingConsent(cookie)

    await sendMessage(cookie, sessionId, `hello there ${marker}`, ip)

    const turn = await prisma.conversationTurn.findFirstOrThrow({ where: { sessionId } })
    expect(turn.transcriptCiphertext).not.toBeNull()
    expect(Buffer.from(turn.transcriptCiphertext!).includes(Buffer.from(marker, 'utf8'))).toBe(
      false
    )
  })
})

describe('POST /api/conversation/[sessionId]/message — ownership and preconditions', () => {
  it("returns 403 for another user's session", async () => {
    const ip = uniqueIp()
    const ownerCookie = await startAnonymousSession()
    const sessionId = await completedSession(ownerCookie)

    const otherCookie = await startAnonymousSession()
    const response = await sendMessage(otherCookie, sessionId, 'not mine', ip)
    expect(response.status).toBe(403)
  })

  it('requires the session to be completed first', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const started = await fetch(`${server.baseUrl}/api/screening/start`, {
      method: 'POST',
      headers: withCsrf(cookie)
    })
    const { sessionId } = await started.json()

    const response = await sendMessage(cookie, sessionId, 'too early', ip)
    expect(response.status).toBe(400)
  })

  it('rejects an empty message', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    const response = await sendMessage(cookie, sessionId, '', ip)
    expect(response.status).toBe(400)
  })
})

describe('POST /api/conversation/[sessionId]/message — rate limiting (R6, NFR1)', () => {
  it('rate limits repeated calls from the same IP', async () => {
    const ip = uniqueIp()
    const cookie = await startAnonymousSession()
    const sessionId = await completedSession(cookie)

    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      const response = await sendMessage(cookie, sessionId, `message ${i}`, ip)
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })
})
