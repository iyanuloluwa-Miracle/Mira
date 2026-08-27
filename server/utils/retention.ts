// [NFR1] The actual storage-limitation logic, kept here (with explicit imports) rather than
// inline in server/tasks/retention.ts, so it's directly importable and directly testable the
// same way server/utils/dsar.ts's functions are — server/tasks/ files rely on Nitro's
// auto-imported globals, which only exist inside the built Nitro runtime, not in a plain
// vitest test. See server/tasks/retention.ts for the scheduled-task wrapper around this.

import { getRetentionConfig } from '../../config/runtime'
import { writeAuditLog } from './audit'
import { prisma } from './db'
import { logger } from './logger'

export interface RetentionResult {
  freeTextEntriesDeleted: number
  abandonedSessionsDeleted: number
  auditLogsDeleted: number
}

function subtractDays(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000)
}

function subtractMonths(from: Date, months: number): Date {
  const result = new Date(from)
  result.setUTCMonth(result.getUTCMonth() - months)
  return result
}

// Logs only counts, via the redacted logger — never which rows, never their contents (rule R4).
// Free-text deletion targets the FreeTextEntry row alone, not the whole ScreeningSession: the
// TriageResult it already produced (scores, band, rationale) is a computed artifact and stays —
// only the raw written text, the one thing in that row worth minimising, is removed.
export async function runRetentionTask(): Promise<RetentionResult> {
  const config = getRetentionConfig()
  const now = new Date()

  const freeTextCutoff = subtractDays(now, config.freeTextRetentionDays)
  const abandonedSessionCutoff = subtractDays(now, config.abandonedSessionRetentionDays)
  const auditLogCutoff = subtractMonths(now, config.auditLogRetentionMonths)

  const [freeText, sessions, auditLogs] = await Promise.all([
    prisma.freeTextEntry.deleteMany({ where: { createdAt: { lt: freeTextCutoff } } }),
    // "Abandoned" = still IN_PROGRESS (or explicitly marked ABANDONED) and started before the
    // cutoff — never completed, so deleting the whole session (cascading its item responses and
    // any free text) removes nothing that ever became a real result.
    prisma.screeningSession.deleteMany({
      where: {
        status: { in: ['IN_PROGRESS', 'ABANDONED'] },
        startedAt: { lt: abandonedSessionCutoff }
      }
    }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditLogCutoff } } })
  ])

  const result: RetentionResult = {
    freeTextEntriesDeleted: freeText.count,
    abandonedSessionsDeleted: sessions.count,
    auditLogsDeleted: auditLogs.count
  }

  logger.info('retention task run', { ...result })

  await writeAuditLog({
    actorType: 'SYSTEM',
    actorId: 'retention-task',
    action: 'RETENTION_TASK_RUN',
    entityType: 'System',
    entityId: 'retention',
    metadata: { ...result }
  })

  return result
}
