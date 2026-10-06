/**
 * Full local smoke scan: every public page + core API paths.
 * Usage: npx tsx scripts/smoke-scan.ts
 */
export {}

const baseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

type Row = { kind: string; path: string; status: number; ok: boolean; note?: string }

function extractSetCookies(response: Response): string[] {
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === 'function') return anyHeaders.getSetCookie()
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

function mergeCookies(response: Response, existing = ''): { cookie: string; csrf: string } {
  const byName = new Map<string, string>()
  for (const p of existing.split('; ').filter(Boolean)) {
    const i = p.indexOf('=')
    byName.set(p.slice(0, i), p.slice(i + 1))
  }
  for (const raw of extractSetCookies(response)) {
    const pair = raw.split(';')[0]
    if (!pair) continue
    const i = pair.indexOf('=')
    byName.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return {
    cookie: [...byName.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    csrf: byName.get('mira_csrf') ?? ''
  }
}

async function get(
  path: string,
  cookie = ''
): Promise<{ res: Response; text: string; jar: ReturnType<typeof mergeCookies> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : undefined,
    redirect: 'manual'
  })
  const text = await res.text()
  return { res, text, jar: mergeCookies(res, cookie) }
}

async function post(
  path: string,
  body: unknown,
  jar: { cookie: string; csrf: string }
): Promise<{ res: Response; json: unknown; jar: ReturnType<typeof mergeCookies> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: jar.cookie,
      'x-csrf-token': jar.csrf
    },
    body: JSON.stringify(body)
  })
  const json = await res.json().catch(() => ({}))
  return { res, json, jar: mergeCookies(res, jar.cookie) }
}

function pageOk(status: number, text: string): { ok: boolean; note?: string } {
  if (status >= 500) return { ok: false, note: 'server error' }
  if (status === 404) return { ok: false, note: 'not found' }
  // Nuxt error pages sometimes still 200 with error payload; catch obvious SSR failures.
  if (/Nuxt Error|Cannot find|500|Internal Server Error/i.test(text) && status >= 400) {
    return { ok: false, note: 'error page body' }
  }
  if (status >= 400 && status !== 401 && status !== 403) {
    return { ok: false, note: `unexpected ${status}` }
  }
  return { ok: status < 400 || status === 302 || status === 301 }
}

async function main() {
  const rows: Row[] = []
  let jar = { cookie: '', csrf: '' }

  const pages = [
    '/',
    '/login',
    '/register',
    '/privacy',
    '/privacy/my-data',
    '/resources',
    '/history',
    '/support/crisis',
    '/clinician/login',
    '/clinician',
    '/clinician/resources',
    '/admin/metrics',
    '/admin/evaluation',
    // Param pages with synthetic ids — expect graceful failure, not 500
    '/screen/00000000-0000-0000-0000-000000000001',
    '/result/00000000-0000-0000-0000-000000000001',
    '/support/00000000-0000-0000-0000-000000000001',
    '/resources/understanding-anxiety',
    '/resources/does-not-exist-slug',
    '/clinician/escalations/00000000-0000-0000-0000-000000000001'
  ]

  for (const path of pages) {
    const { res, text, jar: next } = await get(path, jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    const check = pageOk(res.status, text)
    // Auth-gated pages may redirect or show login UI at 200 — treat 401/403 as ok for gated.
    const gated =
      (path.startsWith('/clinician') && path !== '/clinician/login') ||
      path.startsWith('/admin') ||
      path === '/history' ||
      path === '/privacy/my-data'
    const ok =
      check.ok ||
      (gated &&
        (res.status === 200 || res.status === 401 || res.status === 302 || res.status === 403))
    rows.push({
      kind: 'page',
      path,
      status: res.status,
      ok,
      note: ok ? undefined : check.note
    })
  }

  // Seed CSRF if missing
  if (!jar.csrf) {
    const seed = await get('/api/auth/session')
    jar = seed.jar
  }

  // API: session
  {
    const { res, text } = await get('/api/auth/session', jar.cookie)
    jar = mergeCookies(res, jar.cookie)
    rows.push({
      kind: 'api',
      path: 'GET /api/auth/session',
      status: res.status,
      ok: res.status === 200,
      note: text.slice(0, 80)
    })
  }

  // API: anonymous start
  {
    const { res, json, jar: next } = await post('/api/auth/anonymous-start', {}, jar)
    jar = next
    rows.push({
      kind: 'api',
      path: 'POST /api/auth/anonymous-start',
      status: res.status,
      ok: res.status === 200,
      note: JSON.stringify(json).slice(0, 100)
    })
  }

  // API: register + login
  const email = `mira.scan.${Date.now()}@example.com`
  const password = 'testpass123'
  {
    const { res, json, jar: next } = await post('/api/auth/register', { email, password }, jar)
    jar = next
    rows.push({
      kind: 'api',
      path: 'POST /api/auth/register',
      status: res.status,
      ok: res.status === 200,
      note: JSON.stringify(json).slice(0, 100)
    })
  }
  {
    const { res, json, jar: next } = await post('/api/auth/login', { email, password }, jar)
    jar = next
    rows.push({
      kind: 'api',
      path: 'POST /api/auth/login',
      status: res.status,
      ok: res.status === 200,
      note: JSON.stringify(json).slice(0, 100)
    })
  }

  // API: screening start
  let sessionId = ''
  {
    const { res, json, jar: next } = await post('/api/screening/start', {}, jar)
    jar = next
    const body = json as { sessionId?: string }
    sessionId = body.sessionId ?? ''
    rows.push({
      kind: 'api',
      path: 'POST /api/screening/start',
      status: res.status,
      ok: res.status === 200 && !!sessionId,
      note: JSON.stringify(json).slice(0, 120)
    })
  }

  // Instruments
  for (const code of ['PHQ9', 'GAD7']) {
    const { res, jar: next } = await get(`/api/instruments/${code}`, jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: `GET /api/instruments/${code}`,
      status: res.status,
      ok: res.status === 200
    })
  }

  // Resources API
  {
    const { res, jar: next } = await get('/api/resources', jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: 'GET /api/resources',
      status: res.status,
      ok: res.status === 200
    })
  }
  {
    const { res, jar: next } = await get('/api/resources/understanding-anxiety', jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: 'GET /api/resources/understanding-anxiety',
      status: res.status,
      ok: res.status === 200
    })
  }

  // Screening answer one item if we have a session
  if (sessionId) {
    const {
      res,
      json,
      jar: next
    } = await post(`/api/screening/${sessionId}/answer`, { itemCode: 'PHQ9_Q1', rawValue: 0 }, jar)
    jar = next
    rows.push({
      kind: 'api',
      path: `POST /api/screening/${sessionId}/answer`,
      status: res.status,
      ok: res.status === 200 || res.status === 204,
      note: JSON.stringify(json).slice(0, 100)
    })
  }

  // History / privacy (authenticated)
  {
    const { res, jar: next } = await get('/api/screening/history', jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: 'GET /api/screening/history',
      status: res.status,
      ok: res.status === 200
    })
  }
  {
    const { res, jar: next } = await get('/api/privacy/my-data', jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: 'GET /api/privacy/my-data',
      status: res.status,
      ok: res.status === 200
    })
  }
  {
    const { res, jar: next } = await get('/api/privacy/consent?purpose=SCREENING', jar.cookie)
    jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
    rows.push({
      kind: 'api',
      path: 'GET /api/privacy/consent?purpose=SCREENING',
      status: res.status,
      ok: res.status === 200
    })
  }

  // Live pages that need a real session id
  if (sessionId) {
    for (const path of [`/screen/${sessionId}`, `/result/${sessionId}`, `/support/${sessionId}`]) {
      const { res, text, jar: next } = await get(path, jar.cookie)
      jar = { cookie: next.cookie || jar.cookie, csrf: next.csrf || jar.csrf }
      const check = pageOk(res.status, text)
      rows.push({
        kind: 'page',
        path,
        status: res.status,
        ok: check.ok,
        note: check.note
      })
    }
  }

  const failed = rows.filter((r) => !r.ok)
  for (const r of rows) {
    const mark = r.ok ? 'OK ' : 'FAIL'
    console.log(`${mark}  ${r.status}\t${r.kind}\t${r.path}${r.note ? `\t${r.note}` : ''}`)
  }
  console.log(`\n${rows.length - failed.length}/${rows.length} passed`)
  if (failed.length) {
    console.error('\nFailures:')
    for (const f of failed) console.error(`- ${f.path} (${f.status}) ${f.note ?? ''}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
