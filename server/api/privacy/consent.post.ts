// [NFR1] Records a consent decision: a fresh grant, an explicit decline, or — when the caller
// already has an active grant for this purpose and posts granted:false — a withdrawal of that
// grant. ConsentRecord is one row per decision (see docs/data-model.md); a withdrawal updates
// the existing active row's withdrawnAt rather than being expressed as a second row, so "is
// this purpose currently consented to" is always answerable by looking at one row.

import { z } from 'zod'

const bodySchema = z
  .object({
    purpose: z.enum(['SCREENING', 'RESEARCH_LOGGING', 'HUMAN_REVIEW']),
    granted: z.boolean(),
    consentVersion: z.string().min(1).max(50)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('purpose, granted, and consentVersion are required.')
  const { purpose, granted, consentVersion } = parsed.data

  const ip = getRequestIP(event, { xForwardedFor: true })
  const ipHash = ip ? hashIdentifier(ip) : null

  if (!granted) {
    const activeGrant = await prisma.consentRecord.findFirst({
      where: { userId: user.id, purpose, granted: true, withdrawnAt: null },
      orderBy: { grantedAt: 'desc' }
    })

    if (activeGrant) {
      const withdrawn = await prisma.consentRecord.update({
        where: { id: activeGrant.id },
        data: { withdrawnAt: new Date() }
      })
      return toConsentResponse(withdrawn)
    }
  }

  const record = await prisma.consentRecord.create({
    data: { userId: user.id, purpose, granted, consentVersion, grantedAt: new Date(), ipHash }
  })

  return toConsentResponse(record)
})

function toConsentResponse(record: {
  purpose: string
  granted: boolean
  consentVersion: string
  grantedAt: Date
  withdrawnAt: Date | null
}) {
  return {
    purpose: record.purpose,
    active: record.granted && !record.withdrawnAt,
    consentVersion: record.consentVersion,
    grantedAt: record.grantedAt.toISOString(),
    withdrawnAt: record.withdrawnAt?.toISOString() ?? null
  }
}
