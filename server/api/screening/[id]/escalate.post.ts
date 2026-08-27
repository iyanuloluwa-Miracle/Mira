// [FR6][NFR1] The referral screen's "share this with a clinician" action — the other place
// (besides server/api/screening/[id]/complete.post.ts, for someone who already had active
// HUMAN_REVIEW consent) an Escalation row can be created. This is informed consent given
// *after* the person has already seen their result, not blind consent given beforehand: it
// grants HUMAN_REVIEW consent and creates the Escalation row in the same transaction. Requires
// no request body — there is nothing to configure, only a single yes/no action.

import { HUMAN_REVIEW_CONSENT_VERSION } from '../../../domain/consent'
import { createNotificationService } from '../../../services/notification'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) badRequestError('A session id is required.')

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { triageResult: true }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')
  if (!session.triageResult) notFoundError('This screening session has not been completed yet.')
  if (!session.triageResult.escalated) {
    badRequestError('This result was not flagged for escalation.')
  }

  const existing = await prisma.escalation.findUnique({
    where: { triageResultId: session.triageResult.id },
    select: { id: true }
  })
  // Idempotent: calling this again after it already succeeded (or after complete.post.ts
  // already created the row from pre-existing consent) is a no-op, not an error.
  if (existing) return { escalationRecorded: true }

  const triageResultId = session.triageResult.id
  const riskLevel = session.triageResult.riskLevel

  const ip = getRequestIP(event, { xForwardedFor: true })
  const ipHash = ip ? hashIdentifier(ip) : null

  const escalation = await prisma.$transaction(async (tx) => {
    await tx.consentRecord.create({
      data: {
        userId: user.id,
        purpose: 'HUMAN_REVIEW',
        granted: true,
        consentVersion: HUMAN_REVIEW_CONSENT_VERSION,
        grantedAt: new Date(),
        ipHash
      }
    })

    return tx.escalation.create({
      data: { triageResultId, status: 'PENDING' }
    })
  })

  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'ESCALATION_CREATED',
    entityType: 'Escalation',
    entityId: escalation.id,
    metadata: { riskLevel, triageResultId }
  })

  // [FR6] Best-effort — see ConsoleNotificationService; a notification failure must not turn
  // into a failed request here either.
  await createNotificationService().notifyEscalation({
    escalationId: escalation.id,
    riskLevel,
    pseudonym: user.pseudonym,
    createdAt: escalation.createdAt
  })

  return { escalationRecorded: true }
})
