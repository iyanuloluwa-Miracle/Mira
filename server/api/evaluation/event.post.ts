// [Chapter Four, Section 3.8.3] Logs one usability-study event: a task boundary, a screen
// transition, a back-navigation, or an error encounter. Reachable with no Mira user session —
// the person going through the test is very often anonymous (rule R9), and the very first event
// of a sitting (landing on the home page) fires before they've done anything that would create
// one — so this is gated on the evaluation session alone: the flag must be on, and
// evaluationSessionId must name a real, not-yet-ended EvaluationSession. No field here can ever
// hold what a participant typed or said (rule R10, and prisma/schema.prisma's own comment on
// EvaluationEvent) — screen and taskId are short labels only, validated as such below.

import { z } from 'zod'
import { isEvaluationModeEnabled } from '../../../config/runtime'

const bodySchema = z
  .object({
    evaluationSessionId: z.string().uuid(),
    type: z.enum([
      'TASK_START',
      'TASK_END',
      'SCREEN_TRANSITION',
      'BACK_NAVIGATION',
      'ERROR_ENCOUNTERED',
      'ABANDONMENT'
    ]),
    taskId: z.string().trim().min(1).max(100).optional(),
    screen: z.string().trim().min(1).max(200).optional(),
    completed: z.boolean().optional()
  })
  .strict()

export default defineEventHandler(async (event) => {
  if (!isEvaluationModeEnabled()) forbiddenError('Evaluation mode is not enabled.')

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = evaluationEventRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A valid evaluation event payload is required.')
  const { evaluationSessionId, type, taskId, screen, completed } = parsed.data

  const session = await prisma.evaluationSession.findUnique({
    where: { id: evaluationSessionId },
    select: { endedAt: true }
  })
  if (!session) notFoundError('Evaluation session not found.')
  if (session.endedAt) badRequestError('This evaluation session has already ended.')

  await prisma.evaluationEvent.create({
    data: { evaluationSessionId, type, taskId, screen, completed }
  })

  return { recorded: true }
})
