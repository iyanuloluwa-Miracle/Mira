import { describe, expect, it, vi } from 'vitest'
import { CircuitBreaker } from './circuit-breaker'
import { HttpClassifier } from './http-classifier'

const VALID_RESPONSE_BODY = {
  probability: 0.2,
  label: 'NON_SYMPTOMATIC' as const,
  modelName: 'test-model',
  modelVersion: 'v1',
  topTokens: [],
  latencyMs: 5
}

// vi.fn() is typed explicitly against fetch's own signature throughout this file — otherwise
// TS infers each mock's parameter list from its (often argument-free) implementation, which
// then makes `mock.calls[0]` a 0-length tuple with no elements to assert on.
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function okFetch(body: unknown = VALID_RESPONSE_BODY) {
  return vi.fn<FetchFn>(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => body
      }) as Response
  )
}

function failingFetch(message = 'network down') {
  return vi.fn<FetchFn>(async () => {
    throw new Error(message)
  })
}

function hangingFetch() {
  return vi.fn<FetchFn>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
  )
}

function failNTimesThenSucceed(n: number, body: unknown = VALID_RESPONSE_BODY) {
  let calls = 0
  return vi.fn<FetchFn>(async () => {
    calls += 1
    if (calls <= n) throw new Error('network down')
    return { ok: true, status: 200, json: async () => body } as Response
  })
}

function request(text = 'sample text') {
  return { text, requestId: 'test-request-id' }
}

describe('HttpClassifier — happy path', () => {
  it('POSTs to {baseUrl}/predict with the request as JSON and returns the parsed response', async () => {
    const fetchImpl = okFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const response = await classifier.classify(request('hello'))

    expect(response).toEqual(VALID_RESPONSE_BODY)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://localhost:8001/predict')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(request('hello'))
  })

  it('strips a trailing slash from baseUrl', async () => {
    const fetchImpl = okFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001/',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await classifier.classify(request())
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://localhost:8001/predict')
  })
})

describe('HttpClassifier — timeout handling', () => {
  it('aborts and treats a hanging request as a failure', async () => {
    const fetchImpl = hangingFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(classifier.classify(request())).rejects.toThrow()
    // One original attempt plus one retry, both timing out the same way.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('HttpClassifier — one retry', () => {
  it('succeeds if the first attempt fails but the retry succeeds', async () => {
    const fetchImpl = failNTimesThenSucceed(1)
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const response = await classifier.classify(request())
    expect(response).toEqual(VALID_RESPONSE_BODY)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws after both the original attempt and the retry fail, without a third attempt', async () => {
    const fetchImpl = failingFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(classifier.classify(request())).rejects.toThrow('network down')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('treats a non-2xx response as a failure eligible for retry', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => ({ ok: false, status: 500 }) as Response)
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(classifier.classify(request())).rejects.toThrow(/500/)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('treats a malformed response body as a failure rather than returning it', async () => {
    const fetchImpl = okFetch({ probability: 'not-a-number' })
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(classifier.classify(request())).rejects.toThrow()
  })
})

describe('HttpClassifier — circuit breaker integration', () => {
  it('opens after 5 consecutive classify() failures and then fails fast, without calling fetch', async () => {
    const fetchImpl = failingFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    for (let i = 0; i < 5; i += 1) {
      await expect(classifier.classify(request())).rejects.toThrow()
    }
    expect(classifier.getBreakerState()).toBe('open')

    fetchImpl.mockClear()
    await expect(classifier.classify(request())).rejects.toThrow(/circuit breaker/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recovers: a successful half-open attempt after the cooldown closes the circuit again', async () => {
    let now = 0
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: () => now })
    const fetchImpl = failingFetch()
    const classifier = new HttpClassifier({
      baseUrl: 'http://localhost:8001',
      timeoutMs: 3000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      breaker
    })

    await expect(classifier.classify(request())).rejects.toThrow()
    expect(classifier.getBreakerState()).toBe('open')

    now += 30_000
    fetchImpl.mockClear()
    fetchImpl.mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => VALID_RESPONSE_BODY }) as Response
    )

    const response = await classifier.classify(request())
    expect(response).toEqual(VALID_RESPONSE_BODY)
    expect(classifier.getBreakerState()).toBe('closed')
  })
})
