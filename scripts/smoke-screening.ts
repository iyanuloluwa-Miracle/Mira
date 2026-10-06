export {}

const base = 'http://localhost:3000'

async function jarFrom(res: Response, existing = '') {
  const m = new Map<string, string>()
  for (const p of existing.split('; ').filter(Boolean)) {
    const i = p.indexOf('=')
    m.set(p.slice(0, i), p.slice(i + 1))
  }
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';')[0]
    if (!pair) continue
    const i = pair.indexOf('=')
    m.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return {
    cookie: [...m].map(([k, v]) => `${k}=${v}`).join('; '),
    csrf: m.get('mira_csrf') || ''
  }
}

async function post(path: string, jar: { cookie: string; csrf: string }, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: jar.cookie,
      'x-csrf-token': jar.csrf
    },
    body: JSON.stringify(body)
  })
  const next = await jarFrom(res, jar.cookie)
  const text = await res.text()
  let json: unknown = text
  try {
    json = JSON.parse(text)
  } catch {
    /* keep text */
  }
  return { res, json, jar: next }
}

async function main() {
  let jar = await jarFrom(await fetch(`${base}/api/auth/session`))
  ;({ jar } = await post('/api/auth/anonymous-start', jar, {}))
  const start = await post('/api/screening/start', jar, {})
  jar = start.jar
  if (!start.res.ok) {
    console.error('START FAIL', start.res.status, start.json)
    process.exit(1)
  }
  const body = start.json as {
    sessionId: string
    instruments: {
      phq9: { items: { itemCode: string }[] }
      gad7: { items: { itemCode: string }[] }
    }
  }
  const sid = body.sessionId
  const codes = [
    ...body.instruments.phq9.items.map((i) => i.itemCode),
    ...body.instruments.gad7.items.map((i) => i.itemCode)
  ]
  console.log('session', sid, 'items', codes.length)

  for (const code of codes) {
    const ans = await post(`/api/screening/${sid}/answer`, jar, { itemCode: code, rawValue: 0 })
    jar = ans.jar
    if (!ans.res.ok) {
      console.error('ANSWER FAIL', code, ans.res.status, ans.json)
      process.exit(1)
    }
  }
  console.log('answers ok')

  const text = await post(`/api/screening/${sid}/text`, jar, { skip: true })
  jar = text.jar
  console.log('TEXT', text.res.status, JSON.stringify(text.json).slice(0, 200))

  const complete = await post(`/api/screening/${sid}/complete`, jar, {})
  jar = complete.jar
  console.log('COMPLETE', complete.res.status, JSON.stringify(complete.json).slice(0, 300))

  const result = await fetch(`${base}/api/screening/${sid}/result`, {
    headers: { cookie: jar.cookie }
  })
  console.log('RESULT', result.status, (await result.text()).slice(0, 250))

  const consent = await fetch(`${base}/api/privacy/consent?purpose=SCREENING`, {
    headers: { cookie: jar.cookie }
  })
  console.log('CONSENT', consent.status, await consent.text())

  for (const p of [
    `/result/${sid}`,
    `/screen/${sid}`,
    '/resources',
    '/history',
    '/privacy/my-data',
    '/support/crisis'
  ]) {
    const pr = await fetch(`${base}${p}`, { headers: { cookie: jar.cookie }, redirect: 'manual' })
    console.log('PAGE', p, pr.status)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
