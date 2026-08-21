// [NFR1] Reports the current consent state for one purpose: whether the most recent decision
// is an active, unwithdrawn grant. Used by the client to decide whether the consent modal
// needs to be shown again.

import { z } from 'zod'

const querySchema = z.object({ purpose: z.enum(['SCREENING', 'RESEARCH_LOGGING']) }).strict()

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) unauthorizedError('An active session is required to read consent state.')

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) badRequestError('A valid purpose query parameter is required.')
  const { purpose } = parsed.data

  const record = await prisma.consentRecord.findFirst({
    where: { userId: user.id, purpose },
    orderBy: { grantedAt: 'desc' }
  })

  if (!record) {
    return { purpose, active: false, consentVersion: null, grantedAt: null, withdrawnAt: null }
  }

  return {
    purpose: record.purpose,
    active: record.granted && !record.withdrawnAt,
    consentVersion: record.consentVersion,
    grantedAt: record.grantedAt.toISOString(),
    withdrawnAt: record.withdrawnAt?.toISOString() ?? null
  }
})
