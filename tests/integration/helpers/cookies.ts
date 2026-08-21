// Node's fetch has no automatic cookie jar, so integration tests carry the session cookie
// between requests explicitly: grab it from one response, pass it back in the next request's
// headers.

export function extractCookie(response: Response): string | undefined {
  const cookies = response.headers.getSetCookie()
  return cookies[0]?.split(';')[0]
}
