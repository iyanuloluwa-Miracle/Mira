// [FR7] Attaches the current clinician/session to event.context, mirroring
// server/middleware/auth.ts exactly but for the CLINICIAN_SESSION_COOKIE_NAME cookie and the
// ClinicianSession/Clinician tables — never event.context.user or the Session table. Runs
// unconditionally on every request the same way auth.ts does: with no
// mira_clinician_session cookie present (the overwhelming majority of requests — this cookie
// only exists in a clinician's own browser), it does nothing beyond one getCookie() call, so
// there is no meaningful cost to leaving this unscoped by path.

import type { Clinician, ClinicianSession } from '@prisma/client'

declare module 'h3' {
  interface H3EventContext {
    clinician?: Clinician
    clinicianSession?: ClinicianSession
  }
}

export default defineEventHandler(async (event) => {
  const token = getCookie(event, CLINICIAN_SESSION_COOKIE_NAME)
  if (!token) return

  const tokenHash = hashSessionToken(token)
  const clinicianSession = await prisma.clinicianSession.findUnique({
    where: { tokenHash },
    include: { clinician: true }
  })

  const now = new Date()

  if (
    !clinicianSession ||
    clinicianSession.expiresAt < now ||
    !clinicianSession.clinician.isActive
  ) {
    clearClinicianSessionCookie(event)
    return
  }

  event.context.clinician = clinicianSession.clinician
  event.context.clinicianSession = clinicianSession

  if (
    now.getTime() - clinicianSession.lastSeenAt.getTime() >
    CLINICIAN_SESSION_REFRESH_THRESHOLD_MS
  ) {
    const expiresAt = new Date(now.getTime() + CLINICIAN_SESSION_TTL_MS)
    await prisma.clinicianSession.update({
      where: { id: clinicianSession.id },
      data: { lastSeenAt: now, expiresAt }
    })
    setClinicianSessionCookie(event, token, expiresAt)
  }
})
