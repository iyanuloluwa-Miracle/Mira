// [Chapter Four, Section 3.8.3] Starts one moderated-usability-test sitting. Both gates the
// prompt asked for are enforced here, not just documented: EVALUATION_MODE must be on
// (config/runtime.ts), and consented must be exactly `true` — the researcher confirming, on
// this exact request, that informed consent was already obtained before typing the participant
// code in. EvaluationSession.consentedAt is a required column: there is no way to create a row
// here without it.

import { z } from 'zod'
import { isEvaluationModeEnabled } from '../../../../config/runtime'

const bodySchema = z
  .object({
    participantCode: z.string().trim().min(1).max(100),
    consented: z.literal(true)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)

  if (!isEvaluationModeEnabled()) {
    forbiddenError('Evaluation mode is not enabled (set EVALUATION_MODE=true).')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    badRequestError('A participant code and explicit consent confirmation are required.')
  }
  const { participantCode, consented } = parsed.data

  const session = await prisma.evaluationSession.create({
    data: { participantCode, consentedAt: new Date() }
  })

  await writeAuditLog({
    actorType: 'CLINICIAN',
    actorId: admin.id,
    action: 'EVALUATION_SESSION_STARTED',
    entityType: 'EvaluationSession',
    entityId: session.id,
    metadata: { consented }
  })

  return { id: session.id, startedAt: session.startedAt.toISOString() }
})
