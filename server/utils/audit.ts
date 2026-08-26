// [FR7][R4] Append-only audit trail — distinct from the general application log, which
// server/utils/logger.ts governs. metadataJson must never carry PHI or free text; there's no
// redactor sitting between this and the database the way there is for the logger, so that
// discipline is enforced here by convention and by review, not by code.

import type { Prisma } from '@prisma/client'

export type AuditActorType = 'USER' | 'CLINICIAN' | 'SYSTEM'

export interface AuditLogEntry {
  actorType: AuditActorType
  actorId: string
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Prisma's InputJsonValue type is stricter than Record<string, unknown> — the caller is
      // trusted to pass plain JSON-serializable data (rule R4: never PHI or free text).
      metadataJson: entry.metadata as Prisma.InputJsonValue | undefined
    }
  })
}
