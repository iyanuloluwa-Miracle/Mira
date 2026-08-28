// [Chapter Four, Section 3.8.3] Marks a moderated-usability-test sitting finished, so it stops
// accepting further events (server/api/evaluation/event.post.ts checks endedAt) and its
// abandonment point becomes a real signal derivable from its event stream — see
// docs/evaluation-data-dictionary.md.

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)

  const parsedParam = uuidParamSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedParam.success) badRequestError('A valid evaluation session id is required.')
  const id = parsedParam.data

  const body = (await readBody(event).catch(() => undefined)) ?? {}
  if (!emptyBodySchema.safeParse(body).success) {
    badRequestError('This endpoint does not accept a request body.')
  }

  const session = await prisma.evaluationSession.findUnique({ where: { id } })
  if (!session) notFoundError('Evaluation session not found.')

  if (!session.endedAt) {
    await prisma.evaluationSession.update({ where: { id }, data: { endedAt: new Date() } })
  }

  await writeAuditLog({
    actorType: 'CLINICIAN',
    actorId: admin.id,
    action: 'EVALUATION_SESSION_ENDED',
    entityType: 'EvaluationSession',
    entityId: id
  })

  return { ended: true }
})
