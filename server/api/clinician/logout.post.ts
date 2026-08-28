// [FR7] Ends the current clinician session, if any — the parallel to
// server/api/auth/logout.post.ts. Idempotent, same as that route.

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => undefined)) ?? {}
  if (!emptyBodySchema.safeParse(body).success) {
    badRequestError('This endpoint does not accept a request body.')
  }

  if (event.context.clinicianSession) {
    await prisma.clinicianSession
      .delete({ where: { id: event.context.clinicianSession.id } })
      .catch(() => {
        // Already gone (e.g. a concurrent logout) — the end state is what we wanted anyway.
      })
  }

  clearClinicianSessionCookie(event)

  return { success: true }
})
