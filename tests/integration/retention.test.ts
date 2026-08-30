// [NFR1] Integration coverage for the storage-limitation retention task — real, if ephemeral,
// Postgres, real Prisma cascades. runRetentionTask() has no HTTP route (it only ever runs on
// Nitro's scheduler, see server/tasks/retention.ts), so this calls it directly against an
// ephemeral database rather than through a spawned server — see helpers/ephemeral-db.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { startEphemeralDatabase, type EphemeralDatabase } from './helpers/ephemeral-db'

let db: EphemeralDatabase
let prisma: PrismaClient
let runRetentionTask: typeof import('../../server/utils/retention').runRetentionTask

beforeAll(async () => {
  db = await startEphemeralDatabase()
  process.env.DATABASE_URL = db.databaseUrl
  delete process.env.FREE_TEXT_RETENTION_DAYS
  delete process.env.ABANDONED_SESSION_RETENTION_DAYS
  delete process.env.AUDIT_LOG_RETENTION_MONTHS

  prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } })
  // Imported after DATABASE_URL is set — server/utils/db.ts's Prisma client is constructed
  // lazily, on first property access, so this ordering isn't strictly required, but it keeps
  // the intent explicit rather than relying on that laziness.
  ;({ runRetentionTask } = await import('../../server/utils/retention'))
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await db?.stop()
})

beforeEach(async () => {
  await prisma.auditLog.deleteMany()
  await prisma.user.deleteMany()
})

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function monthsAgo(months: number): Date {
  const result = new Date()
  result.setUTCMonth(result.getUTCMonth() - months)
  return result
}

async function createUserWithSession(
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED',
  startedAt: Date
) {
  const user = await prisma.user.create({
    data: { pseudonym: `test-${crypto.randomUUID()}`, authMode: 'ANONYMOUS' }
  })
  const session = await prisma.screeningSession.create({
    data: { userId: user.id, instrument: 'PHQ9', status, startedAt }
  })
  return { user, session }
}

describe('free-text retention (default 90-day window)', () => {
  it('deletes free text older than the window and keeps free text within it', async () => {
    const { session: oldSession } = await createUserWithSession('COMPLETED', daysAgo(200))
    const { session: recentSession } = await createUserWithSession('COMPLETED', daysAgo(1))

    const oldEntry = await prisma.freeTextEntry.create({
      data: {
        sessionId: oldSession.id,
        ciphertext: Buffer.from('old'),
        iv: Buffer.from('iv1'),
        authTag: Buffer.from('tag1'),
        charCount: 3,
        createdAt: daysAgo(91)
      }
    })
    const recentEntry = await prisma.freeTextEntry.create({
      data: {
        sessionId: recentSession.id,
        ciphertext: Buffer.from('new'),
        iv: Buffer.from('iv2'),
        authTag: Buffer.from('tag2'),
        charCount: 3,
        createdAt: daysAgo(1)
      }
    })

    const result = await runRetentionTask()

    expect(result.freeTextEntriesDeleted).toBe(1)
    expect(await prisma.freeTextEntry.findUnique({ where: { id: oldEntry.id } })).toBeNull()
    expect(await prisma.freeTextEntry.findUnique({ where: { id: recentEntry.id } })).not.toBeNull()

    // Deleting the free text must not touch the session it belongs to.
    expect(
      await prisma.screeningSession.findUnique({ where: { id: oldSession.id } })
    ).not.toBeNull()
  })
})

describe('abandoned-session retention (default 30-day window)', () => {
  it('deletes IN_PROGRESS and ABANDONED sessions started before the window, cascading their answers', async () => {
    const { session: staleInProgress } = await createUserWithSession('IN_PROGRESS', daysAgo(45))
    const { session: staleAbandoned } = await createUserWithSession('ABANDONED', daysAgo(45))
    const { session: recentInProgress } = await createUserWithSession('IN_PROGRESS', daysAgo(1))
    const { session: staleCompleted } = await createUserWithSession('COMPLETED', daysAgo(45))

    await prisma.itemResponse.create({
      data: { sessionId: staleInProgress.id, itemCode: 'phq9_1', rawValue: 2 }
    })

    const result = await runRetentionTask()

    expect(result.abandonedSessionsDeleted).toBe(2)
    expect(
      await prisma.screeningSession.findUnique({ where: { id: staleInProgress.id } })
    ).toBeNull()
    expect(
      await prisma.screeningSession.findUnique({ where: { id: staleAbandoned.id } })
    ).toBeNull()
    expect(
      await prisma.itemResponse.findFirst({ where: { sessionId: staleInProgress.id } })
    ).toBeNull()

    // A completed session past the same age, and any recent session, are untouched — only
    // status plus age together qualify a session as "abandoned".
    expect(
      await prisma.screeningSession.findUnique({ where: { id: recentInProgress.id } })
    ).not.toBeNull()
    expect(
      await prisma.screeningSession.findUnique({ where: { id: staleCompleted.id } })
    ).not.toBeNull()
  })
})

describe('audit log retention (default 12-month window)', () => {
  it('deletes audit log rows older than the window and keeps recent ones', async () => {
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorId: 'test',
        action: 'OLD_ACTION',
        entityType: 'Test',
        entityId: 'old',
        createdAt: monthsAgo(13)
      }
    })
    const recent = await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorId: 'test',
        action: 'RECENT_ACTION',
        entityType: 'Test',
        entityId: 'recent',
        createdAt: monthsAgo(1)
      }
    })

    const result = await runRetentionTask()

    // +1 accounts for this run's own RETENTION_TASK_RUN entry, written after the deletion pass.
    expect(result.auditLogsDeleted).toBe(1)
    expect(await prisma.auditLog.findFirst({ where: { action: 'OLD_ACTION' } })).toBeNull()
    expect(await prisma.auditLog.findUnique({ where: { id: recent.id } })).not.toBeNull()
  })
})

describe('every run writes its own counts-only audit entry (rule R4)', () => {
  it('writes a RETENTION_TASK_RUN audit row with counts and no row-level content', async () => {
    const result = await runRetentionTask()

    const runs = await prisma.auditLog.findMany({ where: { action: 'RETENTION_TASK_RUN' } })
    expect(runs.length).toBe(1)
    expect(runs[0]!.actorType).toBe('SYSTEM')
    expect(runs[0]!.metadataJson).toEqual({
      freeTextEntriesDeleted: result.freeTextEntriesDeleted,
      abandonedSessionsDeleted: result.abandonedSessionsDeleted,
      auditLogsDeleted: result.auditLogsDeleted
    })
  })
})
