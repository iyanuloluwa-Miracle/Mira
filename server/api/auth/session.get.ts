// [FR1] Reports whether the current request carries a valid session. Never requires one —
// this is how the client checks auth state on load, including for anonymous sessions.

export default defineEventHandler((event) => {
  const user = event.context.user

  if (!user) {
    return { authenticated: false as const }
  }

  return {
    authenticated: true as const,
    pseudonym: user.pseudonym,
    authMode: user.authMode
  }
})
