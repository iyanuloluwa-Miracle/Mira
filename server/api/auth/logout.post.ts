// [FR1] Ends the current session, if any. Idempotent — calling this with no session, or an
// already-expired one, still succeeds rather than erroring.

export default defineEventHandler(async (event) => {
  if (event.context.session) {
    await prisma.session.delete({ where: { id: event.context.session.id } }).catch(() => {
      // Already gone (e.g. a concurrent logout) — the end state is what we wanted anyway.
    })
  }

  clearSessionCookie(event)

  return { success: true }
})
