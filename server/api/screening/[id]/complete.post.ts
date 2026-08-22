// [FR4][FR6][NFR3] Scores both instruments, runs computeTriage, and persists the result.
// serverLatencyMs on the session is this handler's own processing time — the NFR3 measurement
// the acceptance criteria asks for. Re-completing an already-completed session returns the
// existing result instead of erroring or recomputing, so a network retry can't create a
// duplicate TriageResult/Escalation/AuditLog.

import { z } from 'zod'
import type { TriageResult } from '@prisma/client'
import {
  IncompleteResponseError,
  InvalidResponseValueError,
  scoreGad7,
  scorePhq9
} from '../../../domain/scoring'
import { PHQ9_ITEM_NINE_CODE } from '../../../domain/instruments/phq9'
import { computeTriage } from '../../../domain/triage'

const bodySchema = z.object({}).strict()

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) badRequestError('A session id is required.')

  const body = (await readBody(event).catch(() => undefined)) ?? {}
  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) badRequestError('This endpoint does not accept a request body.')

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { triageResult: true, itemResponses: true }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')

  if (session.status === 'COMPLETED' && session.triageResult) {
    return buildResultPayload(session.triageResult, start)
  }
  if (session.status !== 'IN_PROGRESS') {
    badRequestError('This screening session can no longer be completed.')
  }

  const responses: Record<string, number> = {}
  for (const response of session.itemResponses) {
    responses[response.itemCode] = response.rawValue
  }

  let phq9Result: ReturnType<typeof scorePhq9>
  let gad7Result: ReturnType<typeof scoreGad7>
  try {
    phq9Result = scorePhq9(responses)
    gad7Result = scoreGad7(responses)
  } catch (error) {
    if (error instanceof IncompleteResponseError || error instanceof InvalidResponseValueError) {
      badRequestError(error.message)
    }
    throw error
  }

  const triage = computeTriage({
    phq9: phq9Result.total,
    gad7: gad7Result.total,
    itemNineValue: responses[PHQ9_ITEM_NINE_CODE]!
  })

  const completedAt = new Date()
  const serverLatencyMs = Date.now() - start

  const triageResult = await prisma.$transaction(async (tx) => {
    const created = await tx.triageResult.create({
      data: {
        sessionId: session.id,
        phq9Total: phq9Result.total,
        gad7Total: gad7Result.total,
        phq9Band: phq9Result.band,
        gad7Band: gad7Result.band,
        riskLevel: triage.riskLevel,
        rationaleJson: triage.rationale,
        escalated: triage.escalate
      }
    })

    await tx.screeningSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', completedAt, serverLatencyMs }
    })

    if (triage.escalate) {
      await tx.escalation.create({
        data: { triageResultId: created.id, status: 'PENDING' }
      })
    }

    return created
  })

  // [FR7][R4] Every completion is audited — this also satisfies "any request touching a
  // CRISIS result writes an AuditLog entry" for this endpoint, since it logs unconditionally.
  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'SCREENING_COMPLETED',
    entityType: 'ScreeningSession',
    entityId: session.id,
    metadata: { riskLevel: triage.riskLevel, escalated: triage.escalate }
  })

  return buildResultPayload(triageResult, start)
})

function buildResultPayload(triageResult: TriageResult, start: number) {
  return {
    sessionId: triageResult.sessionId,
    phq9Total: triageResult.phq9Total,
    gad7Total: triageResult.gad7Total,
    phq9Band: triageResult.phq9Band,
    gad7Band: triageResult.gad7Band,
    riskLevel: triageResult.riskLevel,
    rationale: triageResult.rationaleJson,
    escalated: triageResult.escalated,
    serverTimeMs: Date.now() - start
  }
}
