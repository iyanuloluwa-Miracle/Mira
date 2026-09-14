/**
 * Local auth smoke test: register → login → session, with CSRF (required by
 * server/middleware/csrf.ts). Usage: npx tsx scripts/test-auth.ts
 *
 * Reads APP_BASE_URL from the environment (.env via the shell, or default localhost:3000).
 * Uses a disposable @example.com address — no real inbox.
 */
const baseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

function extractSetCookies(response: Response): string[] {
  // Node 20+: getSetCookie(); fall back for older runtimes.
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === 'function') return anyHeaders.getSetCookie()
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

function cookieJarFrom(response: Response, existing = ''): { cookieHeader: string; csrf: string } {
  const pairs = existing ? existing.split('; ').filter(Boolean) : []
  const byName = new Map(
    pairs.map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i), p.slice(i + 1)] as const
    })
  )

  for (const raw of extractSetCookies(response)) {
    const pair = raw.split(';')[0]
    if (!pair) continue
    const i = pair.indexOf('=')
    byName.set(pair.slice(0, i), pair.slice(i + 1))
  }

  const cookieHeader = [...byName.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  const csrf = byName.get('mira_csrf') ?? ''
  return { cookieHeader, csrf }
}

async function main() {
  const email = `mira.smoke.${Date.now()}@example.com`
  const password = 'testpass123'

  // Seed CSRF cookie (GET is CSRF-exempt).
  const seed = await fetch(`${baseUrl}/api/auth/session`)
  let jar = cookieJarFrom(seed)
  if (!jar.csrf) {
    throw new Error('No mira_csrf cookie on /api/auth/session — is the server running?')
  }

  const mutating = (cookie: string, csrf: string) => ({
    'content-type': 'application/json',
    cookie,
    'x-csrf-token': csrf
  })

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: mutating(jar.cookieHeader, jar.csrf),
    body: JSON.stringify({ email, password })
  })
  jar = cookieJarFrom(registerRes, jar.cookieHeader)
  const registerBody = await registerRes.json().catch(() => ({}))
  if (!registerRes.ok) {
    console.error('REGISTER failed', registerRes.status, registerBody)
    process.exit(1)
  }
  console.log('REGISTER ok', registerRes.status, registerBody)

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: mutating(jar.cookieHeader, jar.csrf),
    body: JSON.stringify({ email, password })
  })
  jar = cookieJarFrom(loginRes, jar.cookieHeader)
  const loginBody = await loginRes.json().catch(() => ({}))
  if (!loginRes.ok) {
    console.error('LOGIN failed', loginRes.status, loginBody)
    process.exit(1)
  }
  console.log('LOGIN ok', loginRes.status, loginBody)

  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie: jar.cookieHeader }
  })
  const sessionBody = await sessionRes.json()
  if (!sessionRes.ok || !sessionBody.authenticated) {
    console.error('SESSION failed', sessionRes.status, sessionBody)
    process.exit(1)
  }
  console.log('SESSION ok', sessionBody)
  console.log(`Auth smoke passed for ${email}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
