// [FR2][NFR1] Deletes a screening session immediately at the owning user's request — the
// person's right to erase a single result without waiting on a full-account DSAR. Prisma
// cascades the delete through item responses, free-text entries, model predictions, the
// triage result, its resource recommendations, and its escalation (prisma/schema.prisma), so
// this one call removes everything the session owns.

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const parsedParam = uuidParamSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedParam.success) badRequestError('A valid session id is required.')
  const sessionId = parsedParam.data

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')

  await prisma.screeningSession.delete({ where: { id: sessionId } })

  // [R4] entityId only — no PHI, no free text, same discipline as every other audit entry.
  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'SCREENING_SESSION_DELETED',
    entityType: 'ScreeningSession',
    entityId: sessionId
  })

  return { deleted: true }
})
