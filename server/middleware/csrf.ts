// [NFR1] CSRF protection (server/utils/csrf.ts) applied globally: the cookie is issued on every
// request so it exists before the client ever needs it, and the token match is enforced on every
// state-changing /api/* request. Page routes are always GET (Nuxt's SSR renderer never mutates
// state on a page load) so scoping enforcement to /api/* covers every route that actually can.

export default defineEventHandler((event) => {
  ensureCsrfCookie(event)

  if (event.path.startsWith('/api/')) {
    requireMatchingCsrfToken(event)
  }
})
