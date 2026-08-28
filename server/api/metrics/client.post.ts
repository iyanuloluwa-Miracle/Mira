// [NFR3] The one metric a server can't measure about itself: how long a request actually took
// as observed by the browser that made it, network included. The client can't know this until
// the response it's timing has already arrived, so it's reported here, in a small follow-up
// call, rather than folded into the original request. name is an allowlist, not a free string —
// this keeps the Metric table's contents exactly as predictable as the server-recorded rows,
// and stops a compromised or misbehaving client from writing arbitrary metric names.

import { z } from 'zod'

const ALLOWED_NAMES = ['screening_complete'] as const

const bodySchema = z
  .object({
    name: z.enum(ALLOWED_NAMES),
    valueMs: z
      .number()
      .int()
      .min(0)
      .max(5 * 60 * 1000),
    sessionId: z.string().uuid()
  })
  .strict()

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const rateLimit = screeningSubmissionRateLimiter.consume(user.id)
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A valid name, valueMs and sessionId are required.')
  const { name, valueMs, sessionId } = parsed.data

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: { userId: true }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')

  await recordMetric({ name: `${name}_e2e_ms`, valueMs, sessionId })

  // [NFR3] Fulfils the ScreeningSession.clientLatencyMs column's own original intent —
  // browser-observed round trip, alongside serverLatencyMs (complete.post.ts), on the row it
  // actually describes, in addition to the Metric row above (which is what percentile/export
  // reporting actually reads).
  if (name === 'screening_complete') {
    await prisma.screeningSession.update({
      where: { id: sessionId },
      data: { clientLatencyMs: valueMs }
    })
  }

  return { recorded: true }
})
