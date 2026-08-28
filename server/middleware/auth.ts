// [FR1] Attaches the current user/session to event.context on every request, if a valid
// session cookie is present. Never throws and never requires a session to exist — screening
// must stay reachable without registration (rule R9), so this middleware only *populates*
// context.user when possible; enforcing that a route requires auth is that route's own job.

import type { Session, User } from '@prisma/client'

declare module 'h3' {
  interface H3EventContext {
    user?: User
    session?: Session
  }
}

export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE_NAME)
  if (!token) return

  const tokenHash = hashSessionToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  })

  const now = new Date()

  if (
    !session ||
    session.expiresAt < now ||
    session.user.deletedAt ||
    now.getTime() - session.createdAt.getTime() > SESSION_ABSOLUTE_TTL_MS
  ) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    clearSessionCookie(event)
    return
  }

  event.context.user = session.user
  event.context.session = session

  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_REFRESH_THRESHOLD_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt }
    })
    setSessionCookie(event, token, expiresAt)
  }
})
