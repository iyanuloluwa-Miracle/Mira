// [FR7] The escalation queue: sorted by risk (CRISIS before HIGH — the only two levels that
// ever escalate) then age (oldest first within the same risk tier), optionally filtered by
// status. Never returns anything beyond a pseudonym — no userId, no email, no free text —
// matching the acceptance criterion that a clinician cannot see any identifier beyond it.

import { z } from 'zod'

const RISK_ORDER: Record<string, number> = { CRISIS: 0, HIGH: 1 }

const querySchema = z
  .object({
    status: z.enum(['PENDING', 'ACKNOWLEDGED', 'CONTACTED', 'CLOSED']).optional()
  })
  .strict()

export default defineEventHandler(async (event) => {
  requireClinician(event)

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) badRequestError('A valid status query parameter is required.')
  const { status } = parsed.data

  const rows = await prisma.escalation.findMany({
    where: status ? { status } : undefined,
    include: {
      triageResult: {
        select: {
          riskLevel: true,
          session: { select: { user: { select: { pseudonym: true } } } }
        }
      }
    }
  })

  const escalations = rows
    .map((row) => ({
      id: row.id,
      status: row.status,
      riskLevel: row.triageResult.riskLevel,
      createdAt: row.createdAt,
      pseudonym: row.triageResult.session.user.pseudonym
    }))
    .sort((a, b) => {
      const riskDiff = (RISK_ORDER[a.riskLevel] ?? 99) - (RISK_ORDER[b.riskLevel] ?? 99)
      if (riskDiff !== 0) return riskDiff
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    .map((escalation) => ({ ...escalation, createdAt: escalation.createdAt.toISOString() }))

  return { escalations }
})
