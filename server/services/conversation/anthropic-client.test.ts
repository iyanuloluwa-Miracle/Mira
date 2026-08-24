import { describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from './anthropic-client'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const VALID_RESPONSE_BODY = {
  model: 'claude-sonnet-5-20260101',
  content: [{ type: 'text', text: 'a safe reply' }],
  usage: { input_tokens: 42, output_tokens: 13 }
}

function okFetch(body: unknown = VALID_RESPONSE_BODY) {
  return vi.fn<FetchFn>(async () => ({ ok: true, status: 200, json: async () => body }) as Response)
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

function request() {
  return {
    messages: [
      { role: 'system' as const, content: 'system instructions' },
      { role: 'user' as const, content: 'hello' }
    ],
    maxTokens: 300
  }
}

describe('AnthropicClient — happy path', () => {
  it('sends the model, max_tokens, system, and messages, and parses the response', async () => {
    const fetchImpl = okFetch()
    const client = new AnthropicClient({
      apiKey: 'test-key',
      model: 'claude-sonnet-5',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const response = await client.complete(request())

    expect(response.text).toBe('a safe reply')
    expect(response.modelName).toBe('claude-sonnet-5')
    expect(response.modelVersion).toBe('claude-sonnet-5-20260101')
    expect(response.promptTokens).toBe(42)
    expect(response.completionTokens).toBe(13)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init?.headers).toMatchObject({ 'x-api-key': 'test-key' })
    const body = JSON.parse(init?.body as string)
    expect(body.model).toBe('claude-sonnet-5')
    expect(body.max_tokens).toBe(300)
    expect(body.system).toBe('system instructions')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('reports the API-returned model string as modelVersion, not the requested model name', async () => {
    const fetchImpl = okFetch({ ...VALID_RESPONSE_BODY, model: 'claude-sonnet-5-20260315' })
    const client = new AnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const response = await client.complete(request())
    expect(response.modelVersion).toBe('claude-sonnet-5-20260315')
  })
})

describe('AnthropicClient — timeout', () => {
  it('aborts a hanging request after timeoutMs', async () => {
    const fetchImpl = hangingFetch()
    const client = new AnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      timeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(client.complete(request())).rejects.toThrow()
  })
})

describe('AnthropicClient — failure handling', () => {
  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => ({ ok: false, status: 500 }) as Response)
    const client = new AnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(client.complete(request())).rejects.toThrow(/500/)
  })

  it('throws on a malformed response body', async () => {
    const fetchImpl = okFetch({ nonsense: true })
    const client = new AnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    await expect(client.complete(request())).rejects.toThrow()
  })
})
