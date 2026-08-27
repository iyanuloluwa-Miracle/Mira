// Integration coverage for prompt 14 (FR5): the resource library API and its wiring into
// screening completion — against a real built server and a real (if ephemeral) Postgres. The
// ephemeral DB starts empty (prisma/seed.ts is not run automatically for it), so this file
// inserts its own small Resource fixture set directly via Prisma, the same pattern other
// integration test files use for their own fixtures.

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

  await prisma.resource.createMany({
    data: [
      {
        title: 'What Your Screening Score Means',
        slug: 'what-your-score-means',
        body: '# What Your Screening Score Means\n\nA test fixture.',
        tags: ['orientation'],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 4,
        sourceAttribution: 'TODO_VERIFY: fixture',
        isActive: true
      },
      {
        title: 'Understanding Low Mood',
        slug: 'understanding-low-mood',
        body: '# Understanding Low Mood\n\n- One\n- Two\n',
        tags: ['depression'],
        minRisk: 'MINIMAL',
        maxRisk: 'HIGH',
        readingTimeMinutes: 5,
        sourceAttribution: 'TODO_VERIFY: fixture',
        isActive: true
      },
      {
        title: 'Understanding Anxiety',
        slug: 'understanding-anxiety',
        body: '# Understanding Anxiety\n\nA test fixture.',
        tags: ['anxiety'],
        minRisk: 'MINIMAL',
        maxRisk: 'HIGH',
        readingTimeMinutes: 5,
        sourceAttribution: 'TODO_VERIFY: fixture',
        isActive: true
      },
      {
        title: 'When to Seek Urgent Help',
        slug: 'when-to-seek-urgent-help',
        body: '# When to Seek Urgent Help\n\nA test fixture.',
        tags: ['safety', 'orientation'],
        minRisk: 'MILD',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 3,
        sourceAttribution: 'TODO_VERIFY: fixture',
        isActive: true
      },
      {
        title: 'A Retired Resource',
        slug: 'retired-resource',
        body: '# Retired\n\nShould never appear anywhere.',
        tags: ['orientation'],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 2,
        sourceAttribution: 'TODO_VERIFY: fixture',
        isActive: false
      }
    ]
  })
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

async function completeScreening(
  cookie: string,
  overrides: Record<string, number> = {}
): Promise<{ sessionId: string; body: Record<string, unknown> }> {
  const started = await fetch(`${server.baseUrl}/api/screening/start`, {
    method: 'POST',
    headers: { cookie }
  })
  const { sessionId } = await started.json()

  const values = { ...allItemsAtZero(), ...overrides }
  for (const [itemCode, rawValue] of Object.entries(values)) {
    await fetch(`${server.baseUrl}/api/screening/${sessionId}/answer`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ itemCode, rawValue })
    })
  }

  const response = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
    method: 'POST',
    headers: { cookie }
  })
  const body = await response.json()
  return { sessionId, body }
}

describe('GET /api/resources — the library listing', () => {
  it('is reachable with no cookie at all', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources`)
    expect(response.status).toBe(200)
  })

  it('lists only active resources', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources`)
    const { resources } = await response.json()
    const slugs = resources.map((r: { slug: string }) => r.slug)
    expect(slugs).toContain('what-your-score-means')
    expect(slugs).not.toContain('retired-resource')
  })

  it('does not include the article body in the listing', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources`)
    const { resources } = await response.json()
    expect(resources[0]).not.toHaveProperty('body')
  })
})

describe('GET /api/resources/[slug] — one resource', () => {
  it('is reachable with no cookie at all and renders markdown to HTML', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources/understanding-low-mood`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.title).toBe('Understanding Low Mood')
    expect(body.bodyHtml).toContain('<h1>')
    expect(body.bodyHtml).toContain('<li>')
    expect(body.sourceAttribution).toContain('TODO_VERIFY')
  })

  it('returns 404 for an unknown slug', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources/does-not-exist`)
    expect(response.status).toBe(404)
  })

  it('returns 404 for an inactive resource', async () => {
    const response = await fetch(`${server.baseUrl}/api/resources/retired-resource`)
    expect(response.status).toBe(404)
  })
})

describe('resource recommendations attach to a completed screening', () => {
  it('returns a non-empty ranked resources array on complete', async () => {
    const cookie = await startAnonymousSession()
    const { body } = await completeScreening(cookie)
    expect(Array.isArray(body.resources)).toBe(true)
    expect((body.resources as unknown[]).length).toBeGreaterThan(0)
  })

  it('persists ResourceRecommendation rows linked to the triage result', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId } = await completeScreening(cookie)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const rows = await prisma.resourceRecommendation.findMany({
      where: { triageResultId: triageResult.id },
      orderBy: { rank: 'asc' }
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1))
  })

  it('GET result returns the same recommendations complete already returned', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId, body: completeBody } = await completeScreening(cookie)

    const resultResponse = await fetch(`${server.baseUrl}/api/screening/${sessionId}/result`, {
      headers: { cookie }
    })
    const resultBody = await resultResponse.json()

    expect(resultBody.resources).toEqual(completeBody.resources)
  })

  it('re-completing an already-completed session returns the same recommendations, not new ones', async () => {
    const cookie = await startAnonymousSession()
    const { sessionId, body: first } = await completeScreening(cookie)

    const second = await fetch(`${server.baseUrl}/api/screening/${sessionId}/complete`, {
      method: 'POST',
      headers: { cookie }
    })
    const secondBody = await second.json()

    expect(secondBody.resources).toEqual(first.resources)

    const triageResult = await prisma.triageResult.findUniqueOrThrow({ where: { sessionId } })
    const rows = await prisma.resourceRecommendation.findMany({
      where: { triageResultId: triageResult.id }
    })
    // Still exactly one row per recommended resource — completing twice must not duplicate them.
    expect(rows.length).toBe((first.resources as unknown[]).length)
  })

  it('a CRISIS result (PHQ-9 item 9 above zero) still gets a non-empty recommendation list', async () => {
    const cookie = await startAnonymousSession()
    const { body } = await completeScreening(cookie, { [PHQ9_ITEM_NINE_CODE]: 1 })

    expect(body.riskLevel).toBe('CRISIS')
    expect((body.resources as unknown[]).length).toBeGreaterThan(0)
  })
})
