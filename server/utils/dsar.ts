// [NFR1] Data subject access request support: export (right to data portability) and erasure
// (right to erasure) of a person's own data, as two reusable functions rather than logic
// embedded in a route handler — so the same code path serves the privacy dashboard UI and any
// future request a human has to handle manually (e.g. a request that arrives by email instead
// of through the app). See docs/ndpa-mapping.md for which NDPA right each function backs.
//
// Both functions take a Prisma User.id, not a pseudonym or an H3Event — callers (server/api/
// privacy/*) own the auth check; this file only ever does the actual data work, the same
// separation server/domain/ keeps from server/api/, even though this file isn't pure (it has to
// touch Prisma to gather data from a dozen tables) so it lives in server/utils/, not server/domain/.

import { decryptField } from './crypto'

export interface UserDataExport {
  exportedAt: string
  profile: {
    pseudonym: string
    authMode: string
    email: string | null
    ageBand: string | null
    createdAt: string
    lastSeenAt: string
  }
  consentRecords: Array<{
    purpose: string
    granted: boolean
    consentVersion: string
    grantedAt: string
    withdrawnAt: string | null
  }>
  screeningSessions: Array<{
    id: string
    instrument: string
    status: string
    startedAt: string
    completedAt: string | null
    freeTextExcluded: boolean
    answers: Array<{ itemCode: string; rawValue: number; answeredAt: string }>
    freeText: { text: string; charCount: number; createdAt: string } | null
    triageResult: {
      phq9Total: number
      gad7Total: number
      phq9Band: string
      gad7Band: string
      riskLevel: string
      rationale: unknown
      escalated: boolean
      createdAt: string
      recommendedResourceSlugs: string[]
      escalation: {
        status: string
        createdAt: string
        acknowledgedAt: string | null
        notes: string | null
      } | null
    } | null
    conversationTurns: Array<{
      turnNumber: number
      modelName: string
      modelVersion: string
      createdAt: string
      transcript: string | null
    }>
  }>
  auditLogEntries: Array<{
    action: string
    entityType: string
    entityId: string
    createdAt: string
  }>
}

function decryptOrNull(
  ciphertext: Uint8Array | null,
  iv: Uint8Array | null,
  authTag: Uint8Array | null
): string | null {
  if (!ciphertext || !iv || !authTag) return null
  return decryptField({
    ciphertext: Buffer.from(ciphertext),
    iv: Buffer.from(iv),
    authTag: Buffer.from(authTag)
  })
}

// [NFR1] Right to data portability — everything the privacy dashboard's "what is stored about
// you" summary claims exists, in one machine-readable document. Decrypts every encrypted field
// it touches (email, free text, conversation transcripts, clinician notes) so the export is
// genuinely readable by the person it's about, not a dump of opaque ciphertext.
export async function exportUserData(userId: string): Promise<UserDataExport> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      consentRecords: true,
      screeningSessions: {
        include: {
          itemResponses: true,
          freeTextEntries: { take: 1 },
          conversationTurns: true,
          triageResult: {
            include: {
              recommendations: { include: { resource: { select: { slug: true } } } },
              escalation: true
            }
          }
        }
      }
    }
  })

  const auditLogEntries = await prisma.auditLog.findMany({
    where: { actorType: 'USER', actorId: userId },
    orderBy: { createdAt: 'asc' }
  })

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      pseudonym: user.pseudonym,
      authMode: user.authMode,
      email: decryptOrNull(user.emailCiphertext, user.emailIv, user.emailAuthTag),
      ageBand: user.ageBand,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString()
    },
    consentRecords: user.consentRecords.map((record) => ({
      purpose: record.purpose,
      granted: record.granted,
      consentVersion: record.consentVersion,
      grantedAt: record.grantedAt.toISOString(),
      withdrawnAt: record.withdrawnAt?.toISOString() ?? null
    })),
    screeningSessions: user.screeningSessions.map((session) => {
      const freeTextEntry = session.freeTextEntries[0]
      const triageResult = session.triageResult

      return {
        id: session.id,
        instrument: session.instrument,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
        freeTextExcluded: session.freeTextExcluded,
        answers: session.itemResponses.map((response) => ({
          itemCode: response.itemCode,
          rawValue: response.rawValue,
          answeredAt: response.answeredAt.toISOString()
        })),
        freeText: freeTextEntry
          ? {
              text:
                decryptOrNull(freeTextEntry.ciphertext, freeTextEntry.iv, freeTextEntry.authTag) ??
                '',
              charCount: freeTextEntry.charCount,
              createdAt: freeTextEntry.createdAt.toISOString()
            }
          : null,
        triageResult: triageResult
          ? {
              phq9Total: triageResult.phq9Total,
              gad7Total: triageResult.gad7Total,
              phq9Band: triageResult.phq9Band,
              gad7Band: triageResult.gad7Band,
              riskLevel: triageResult.riskLevel,
              rationale: triageResult.rationaleJson,
              escalated: triageResult.escalated,
              createdAt: triageResult.createdAt.toISOString(),
              recommendedResourceSlugs: triageResult.recommendations.map((r) => r.resource.slug),
              escalation: triageResult.escalation
                ? {
                    status: triageResult.escalation.status,
                    createdAt: triageResult.escalation.createdAt.toISOString(),
                    acknowledgedAt: triageResult.escalation.acknowledgedAt?.toISOString() ?? null,
                    notes: decryptOrNull(
                      triageResult.escalation.notesCiphertext,
                      triageResult.escalation.notesIv,
                      triageResult.escalation.notesAuthTag
                    )
                  }
                : null
            }
          : null,
        conversationTurns: session.conversationTurns.map((turn) => ({
          turnNumber: turn.turnNumber,
          modelName: turn.modelName,
          modelVersion: turn.modelVersion,
          createdAt: turn.createdAt.toISOString(),
          transcript: decryptOrNull(
            turn.transcriptCiphertext,
            turn.transcriptIv,
            turn.transcriptAuthTag
          )
        }))
      }
    }),
    auditLogEntries: auditLogEntries.map((entry) => ({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      createdAt: entry.createdAt.toISOString()
    }))
  }
}

// [NFR1] Right to erasure — a real, cascading hard delete, never a soft flag. Deleting the User
// row cascades through Session, ConsentRecord, and ScreeningSession (and everything
// ScreeningSession owns: item responses, free text, model predictions, conversation turns, the
// triage result, its resource recommendations, and its escalation) via `onDelete: Cascade` in
// prisma/schema.prisma — one call removes every row across every table that traces back to this
// user. AuditLog rows recording this person's own past actions are the one deliberate exception:
// they carry no PHI (rule R4), and the append-only audit trail's integrity (rule R4/NFR1) takes
// priority over erasing a bare actorId that no longer resolves to anything — see
// docs/ndpa-mapping.md for the full reasoning, not silently glossed over here.
export async function eraseUserData(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } })
}
