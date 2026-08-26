import { describe, expect, it } from 'vitest'
import { MOCK_LLM_MODEL_VERSION } from '../../domain/llm-contract'
import { MockLlmClient } from './mock-client'

const client = new MockLlmClient()

describe('MockLlmClient', () => {
  it('always reports MOCK_LLM_MODEL_VERSION, never anything that could pass for a real model', async () => {
    const response = await client.complete({
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 200
    })
    expect(response.modelVersion).toBe(MOCK_LLM_MODEL_VERSION)
    expect(response.modelVersion).toBe('mock-conversation-0.1')
  })

  it('returns a non-empty, safe-sounding reply', async () => {
    const response = await client.complete({
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 200
    })
    expect(response.text.length).toBeGreaterThan(0)
  })

  it('reports non-negative token counts and latency', async () => {
    const response = await client.complete({
      messages: [
        { role: 'system', content: 'x' },
        { role: 'user', content: 'hello there' }
      ],
      maxTokens: 200
    })
    expect(response.promptTokens).toBeGreaterThan(0)
    expect(response.completionTokens).toBeGreaterThan(0)
    expect(response.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic across calls', async () => {
    const a = await client.complete({ messages: [{ role: 'user', content: 'x' }], maxTokens: 200 })
    const b = await client.complete({ messages: [{ role: 'user', content: 'x' }], maxTokens: 200 })
    expect(a.text).toBe(b.text)
  })
})
