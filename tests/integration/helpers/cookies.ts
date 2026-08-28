// Node's fetch has no automatic cookie jar, so integration tests carry cookies between requests
// explicitly: grab them from one response, pass them back in the next request's headers.

const CSRF_COOKIE_NAME = 'mira_csrf'

// Combines every Set-Cookie header on a response into one Cookie-header-shaped string — a
// response now typically carries more than one (a session cookie plus, on the first
// cookie-less request of a test, a fresh mira_csrf cookie from server/middleware/csrf.ts), and a
// single `Cookie:` request header can carry multiple `name=value` pairs separated by `; `.
export function extractCookie(response: Response): string | undefined {
  const cookies = response.headers.getSetCookie()
  const pairs = cookies.map((cookie) => cookie.split(';')[0])
  return pairs.length > 0 ? pairs.join('; ') : undefined
}

// The mira_csrf cookie is only ever (re)issued when a request arrives with none — server/utils/
// csrf.ts's ensureCsrfCookie — so this only returns something on the first cookie-less request
// of a test; callers capture it once, alongside extractCookie's combined cookie string, and reuse
// both for the rest of that test, the same way the session cookie itself is already reused.
export function extractCsrfToken(response: Response): string | undefined {
  const cookies = response.headers.getSetCookie()
  const csrfCookie = cookies.find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))
  return csrfCookie?.split(';')[0]?.split('=')[1]
}
