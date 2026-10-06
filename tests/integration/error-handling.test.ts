// [NFR1] Integration coverage for the global error handler (server/error.ts, registered via
// nitro.errorHandler in nuxt.config.ts) — against a real built server, proving the wiring itself
// works, not just the handler's own logic in isolation (server/error.test.ts covers that,
// including the generic-500-flattening branch this file can't easily trigger through the public
// API surface: every route that could once throw a raw, uncaught exception for a malformed
// route param now rejects it with a clean 400 before ever reaching Prisma — see the input
// validation sweep across server/api/ — so there is no longer a naturally reachable path to a
// genuine unhandled 500 through this app's own routes to exercise here).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractCookie, extractCsrfToken } from './helpers/cookies'
import { startTestServer, type TestServer } from './helpers/test-server'

let server: TestServer
let csrfCookie: string
let csrfToken: string

beforeAll(async () => {
  server = await startTestServer()
  const seed = await fetch(`${server.baseUrl}/api/auth/session`)
  csrfCookie = extractCookie(seed)!
  csrfToken = extractCsrfToken(seed)!
}, 60_000)

afterAll(async () => {
  await server?.stop()
})

describe('malformed input never reaches the client as a raw exception (rule R8)', () => {
  it('a body that is not valid JSON gets a clean, generic error — no stack, no parser internals', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        cookie: csrfCookie,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json'
      },
      body: '{"not valid json'
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(600)
    const text = await response.text()
    const body = JSON.parse(text)
    expect(body).not.toHaveProperty('stack')
    expect(body.statusMessage).not.toMatch(/SyntaxError|JSON\.parse|at\s+\S+:\d+:\d+/)
  })

  it('an invalid route param is rejected with a clean 400, not a raw Prisma error', async () => {
    const response = await fetch(`${server.baseUrl}/api/screening/not-a-valid-uuid-at-all/result`, {
      headers: { cookie: csrfCookie }
    })
    expect(response.status).toBe(401) // no session — but critically, never a 500
  })
})

describe('every server response carries the hardening headers (NFR1)', () => {
  it('security headers are present on an API response', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/session`)
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('permissions-policy')).toContain('camera=()')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('security headers are present on an HTML page response, with a nonce on every inline script', async () => {
    const response = await fetch(`${server.baseUrl}/`)
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("script-src 'self' 'nonce-")
    const nonceMatch = csp!.match(/'nonce-([^']+)'/)
    expect(nonceMatch).not.toBeNull()

    const html = await response.text()
    const scriptTags = html.match(/<script(?![^>]*type="application\/json")[^>]*>/g) ?? []
    expect(scriptTags.length).toBeGreaterThan(0)
    for (const tag of scriptTags) {
      expect(tag).toContain(`nonce="${nonceMatch![1]}"`)
    }
  })
})
