// [FR2][R9] Starts a new PHQ-9 + GAD-7 screening session for the current user — anonymous or
// registered, either is fine (rule R9). Returns both validated instrument definitions so the
// client has everything it needs to render the flow without a second round trip.

import { z } from 'zod'
import { GAD7 } from '../../domain/instruments/gad7'
import { PHQ9 } from '../../domain/instruments/phq9'

const bodySchema = z.object({}).strict()

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const body = (await readBody(event).catch(() => undefined)) ?? {}
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) badRequestError('This endpoint does not accept a request body.')

  const session = await prisma.screeningSession.create({
    data: { userId: user.id, instrument: 'COMBINED', status: 'IN_PROGRESS' }
  })

  return {
    sessionId: session.id,
    instruments: { phq9: PHQ9, gad7: GAD7 },
    serverTimeMs: Date.now() - start
  }
})
