// Integration coverage for the data-subject rights dashboard (NFR1) — against a real built
// server and a real (if ephemeral) Postgres. Covers exactly the prompt's acceptance criteria:
// a direct database query returns zero rows for the user across every table after deletion, and
// the export contains everything the "what is stored" summary claims exists.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { GAD7_ITEMS } from '../../server/domain/instruments/gad7'
import { PHQ9_ITEM_NINE_CODE, PHQ9_ITEMS } from '../../server/domain/instruments/phq9'
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

async function startUserSession(): Promise<{ cookie: string; pseudonym: string }> {
  const response = await fetch(`${server.baseUrl}/api/auth/anonymous-start`, { method: 'POST' })
  const cookie = extractCookie(response)!
  const { pseudonym } = await response.json()
  return { cookie, pseudonym }
}

function highRiskAnswers(): Record<string, number> {
  const values: Record<string, number> = {}
  for (const item of PHQ9_ITEMS)
    values[item.itemCode] = item.itemCode === PHQ9_ITEM_NINE_CODE ? 0 : 3
  for (const item of GAD7_ITEMS) values[item.itemCode] = 0
  return values
}

async function completeScreeningWithFreeText(cookie: string, text: string): Promise<string> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: { cookie }
  })
  const { sessionId } = await started.json()

  for (const [itemCode, rawValue] of Object.entries(highRiskAnswers())) {
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ itemCode, rawValue })
    })
  }

  await fetch(`${server.baseUrl}/api/screening/${sessionId}/text`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  })

  await fetch(`${server.baseUrl}/api/privacy/consent`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ purpose: 'HUMAN_REVIEW', granted: true, consentVersion: '1' })
  })

  await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
    method: 'POST',
    headers: { cookie }
  })

  return sessionId
}

describe('what is stored (NFR1)', () => {
  it('counts a completed session, its free text, and its escalation record', async () => {
    const { cookie } = await startUserSession()
    await completeScreeningWithFreeText(cookie, 'A written response for the summary test.')

    const response = await fetch(`${server.baseUrl}/api/privacy/my-data`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const { categories } = await response.json()

    const byKey = Object.fromEntries(
      (categories as Array<{ key: string; count: number }>).map((c) => [c.key, c.count])
    )
    expect(byKey.screeningSessions).toBe(1)
    expect(byKey.freeText).toBe(1)
    expect(byKey.escalations).toBe(1)
  })

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/privacy/my-data`)
    expect(response.status).toBe(401)
  })
})

describe('export (right to data portability, NFR1)', () => {
  it('contains everything the summary claims exists, decrypted and readable', async () => {
    const { cookie, pseudonym } = await startUserSession()
    const freeText = 'Everything the export must include, verbatim.'
    await completeScreeningWithFreeText(cookie, freeText)

    const summaryResponse = await fetch(`${server.baseUrl}/api/privacy/my-data`, {
      headers: { cookie }
    })
    const { categories } = await summaryResponse.json()
    const byKey = Object.fromEntries(
      (categories as Array<{ key: string; count: number }>).map((c) => [c.key, c.count])
    )

    const exportResponse = await fetch(`${server.baseUrl}/api/privacy/export`, {
      headers: { cookie }
    })
    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers.get('content-disposition')).toContain('mira-my-data.json')
    const data = await exportResponse.json()

    expect(data.profile.pseudonym).toBe(pseudonym)
    expect(data.screeningSessions.length).toBe(byKey.screeningSessions)
    expect(data.consentRecords.length).toBe(byKey.consentRecords)

    const session = data.screeningSessions[0]
    expect(session.freeText.text).toBe(freeText)
    expect(session.triageResult.riskLevel).toBe('HIGH')
    expect(session.triageResult.escalation.status).toBe('PENDING')

    const audit = await prisma.auditLog.findMany({
      where: { action: 'DATA_EXPORTED', entityType: 'User' }
    })
    expect(audit.length).toBe(1)
  })

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/privacy/export`)
    expect(response.status).toBe(401)
  })
})

describe('withdrawing consent takes effect immediately (NFR1)', () => {
  it('SCREENING and RESEARCH_LOGGING both round-trip through grant and withdrawal', async () => {
    const { cookie } = await startUserSession()

    for (const purpose of ['SCREENING', 'RESEARCH_LOGGING']) {
      const grant = await fetch(`${server.baseUrl}/api/privacy/consent`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ purpose, granted: true, consentVersion: '1' })
      })
      expect((await grant.json()).active).toBe(true)

      const withdraw = await fetch(`${server.baseUrl}/api/privacy/consent`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ purpose, granted: false, consentVersion: '1' })
      })
      const withdrawn = await withdraw.json()
      expect(withdrawn.active).toBe(false)
      expect(withdrawn.withdrawnAt).not.toBeNull()

      const state = await fetch(`${server.baseUrl}/api/privacy/consent?purpose=${purpose}`, {
        headers: { cookie }
      })
      expect((await state.json()).active).toBe(false)
    }
  })
})

describe('deletion (right to erasure, NFR1) — the acceptance criterion', () => {
  it('rejects a confirmation that does not match the pseudonym exactly', async () => {
    const { cookie } = await startUserSession()

    const response = await fetch(`${server.baseUrl}/api/privacy/delete-account`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'not-the-right-pseudonym' })
    })
    expect(response.status).toBe(400)
  })

  it('a direct database query returns zero rows for the user across every linked table, and the audit trail survives', async () => {
    const { cookie, pseudonym } = await startUserSession()
    const sessionId = await completeScreeningWithFreeText(
      cookie,
      'This must not exist anywhere after deletion.'
    )

    const userBefore = await prisma.user.findUniqueOrThrow({ where: { pseudonym } })
    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const escalation = await prisma.escalation.findUniqueOrThrow({
      where: { triageResultId: triageResult.id }
    })

    const response = await fetch(`${server.baseUrl}/api/privacy/delete-account`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: pseudonym })
    })
    expect(response.status).toBe(200)
    expect((await response.json()).deleted).toBe(true)

    // The acceptance criterion, literally: every table that traces back to this user.
    expect(await prisma.user.findUnique({ where: { id: userBefore.id } })).toBeNull()
    expect(await prisma.session.findFirst({ where: { userId: userBefore.id } })).toBeNull()
    expect(await prisma.consentRecord.findFirst({ where: { userId: userBefore.id } })).toBeNull()
    expect(await prisma.screeningSession.findUnique({ where: { id: sessionId } })).toBeNull()
    expect(await prisma.itemResponse.findFirst({ where: { sessionId } })).toBeNull()
    expect(await prisma.freeTextEntry.findFirst({ where: { sessionId } })).toBeNull()
    expect(await prisma.triageResult.findUnique({ where: { id: triageResult.id } })).toBeNull()
    expect(await prisma.escalation.findUnique({ where: { id: escalation.id } })).toBeNull()

    // The session cookie no longer authenticates anything — the delete cascaded the Session
    // row away and the response also cleared the cookie.
    const sessionCheck = await fetch(`${server.baseUrl}/api/auth/session`, { headers: { cookie } })
    expect(await sessionCheck.json()).toEqual({ authenticated: false })

    // The one deliberate, documented exception (dsar.ts): this user's own past AuditLog rows
    // are not erased, since AuditLog carries no PHI and has no foreign key to User at all.
    const survivingAuditEntries = await prisma.auditLog.findMany({
      where: { actorType: 'USER', actorId: userBefore.id }
    })
    expect(survivingAuditEntries.length).toBeGreaterThan(0)
    expect(survivingAuditEntries.some((entry) => entry.action === 'ACCOUNT_DELETED')).toBe(true)
  })

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/privacy/delete-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'anything' })
    })
    expect(response.status).toBe(401)
  })
})
