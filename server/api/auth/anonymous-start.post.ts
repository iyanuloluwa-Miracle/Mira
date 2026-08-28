// [FR1][R9] Establishes an anonymous identity and session with no email or password required.
// This is the first-class entry path — idempotent if the caller already has a valid session,
// so the client can safely call this on every app load without creating throwaway users.

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => undefined)) ?? {}
  if (!emptyBodySchema.safeParse(body).success) {
    badRequestError('This endpoint does not accept a request body.')
  }
  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  if (event.context.user) {
    return { pseudonym: event.context.user.pseudonym, authMode: event.context.user.authMode }
  }

  const user = await createUserWithPseudonym((pseudonym) =>
    prisma.user.create({ data: { pseudonym, authMode: 'ANONYMOUS' } })
  )

  await issueSession(event, user.id)

  return { pseudonym: user.pseudonym, authMode: user.authMode }
})
