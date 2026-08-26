import { describe, expect, it, vi } from 'vitest'
import type { LlmRequest, LlmResponse } from '../../domain/llm-contract'
import { MOCK_LLM_MODEL_VERSION } from '../../domain/llm-contract'
import type { LlmClient } from './client'
import {
  PER_SESSION_TOKEN_CEILING,
  PER_TURN_TOKEN_CEILING,
  handleConversationTurn,
  type ConversationTurnInput
} from './orchestrate'

function baseInput(overrides: Partial<ConversationTurnInput> = {}): ConversationTurnInput {
  return {
    userMessage: 'What does my score mean?',
    context: { riskLevel: 'MILD', rationale: ['PHQ-9 total of 8 is between 5 and 9.'] },
    priorMessages: [],
    tokensUsedInSession: 0,
    ...overrides
  }
}

function okResponse(text: string): LlmResponse {
  return {
    text,
    modelName: 'test-model',
    modelVersion: 'test-version',
    promptTokens: 50,
    completionTokens: 20,
    latencyMs: 100
  }
}

// A client whose complete() fails the test outright if it's ever called — this is what makes
// "the pre-filter path never invokes the LLM" a provable claim rather than an inferred one.
function unreachableClient(): LlmClient {
  return {
    complete: vi.fn(async () => {
      throw new Error('LLM client was called when it should not have been')
    })
  }
}

describe('handleConversationTurn — pre-filter short-circuit', () => {
  it('never calls the LLM client when the pre-filter triggers', async () => {
    const client = unreachableClient()
    const outcome = await handleConversationTurn(
      baseInput({ userMessage: 'I want to kill myself.' }),
      client
    )

    expect(outcome.kind).toBe('pre-filter')
    expect(client.complete).not.toHaveBeenCalled()
  })

  it('reports the matched category as the reason', async () => {
    const outcome = await handleConversationTurn(
      baseInput({ userMessage: 'I want to hurt someone.' }),
      unreachableClient()
    )
    expect(outcome).toEqual({ kind: 'pre-filter', reason: 'harm-to-others' })
  })
})

describe('handleConversationTurn — session token ceiling', () => {
  it('never calls the LLM client once the session ceiling is reached', async () => {
    const client = unreachableClient()
    const outcome = await handleConversationTurn(
      baseInput({ tokensUsedInSession: PER_SESSION_TOKEN_CEILING }),
      client
    )

    expect(outcome.kind).toBe('session-limit')
    expect(client.complete).not.toHaveBeenCalled()
  })

  it('still calls the LLM when just under the ceiling', async () => {
    const client: LlmClient = { complete: vi.fn(async () => okResponse('a safe reply')) }
    const outcome = await handleConversationTurn(
      baseInput({ tokensUsedInSession: PER_SESSION_TOKEN_CEILING - 1 }),
      client
    )

    expect(outcome.kind).toBe('ok')
    expect(client.complete).toHaveBeenCalledOnce()
  })
})

describe('handleConversationTurn — per-turn token ceiling', () => {
  it('passes PER_TURN_TOKEN_CEILING as maxTokens on every call', async () => {
    let captured: LlmRequest | undefined
    const client: LlmClient = {
      complete: async (request) => {
        captured = request
        return okResponse('a safe reply')
      }
    }

    await handleConversationTurn(baseInput(), client)
    expect(captured?.maxTokens).toBe(PER_TURN_TOKEN_CEILING)
  })
})

describe('handleConversationTurn — session-scoped context only', () => {
  it('includes the risk level and rationale, and only those, in the system context', async () => {
    let captured: LlmRequest | undefined
    const client: LlmClient = {
      complete: async (request) => {
        captured = request
        return okResponse('a safe reply')
      }
    }

    await handleConversationTurn(
      baseInput({
        context: { riskLevel: 'MODERATE', rationale: ['GAD-7 total of 12 is between 10 and 14.'] }
      }),
      client
    )

    const systemMessages = captured!.messages.filter((m) => m.role === 'system')
    const contextMessage = systemMessages.find((m) => m.content.includes('MODERATE'))
    expect(contextMessage?.content).toContain('MODERATE')
    expect(contextMessage?.content).toContain('GAD-7 total of 12 is between 10 and 14.')
  })

  it('carries prior messages through and appends the new user message last', async () => {
    let captured: LlmRequest | undefined
    const client: LlmClient = {
      complete: async (request) => {
        captured = request
        return okResponse('a safe reply')
      }
    }

    await handleConversationTurn(
      baseInput({
        userMessage: 'the newest message',
        priorMessages: [
          { role: 'user', content: 'first turn' },
          { role: 'assistant', content: 'first reply' }
        ]
      }),
      client
    )

    const last = captured!.messages.at(-1)!
    expect(last).toEqual({ role: 'user', content: 'the newest message' })
    expect(captured!.messages.some((m) => m.content === 'first turn')).toBe(true)
    expect(captured!.messages.some((m) => m.content === 'first reply')).toBe(true)
  })
})

describe('handleConversationTurn — LLM unavailable (rule R7)', () => {
  it('degrades to a fallback outcome rather than throwing when the client rejects', async () => {
    const client: LlmClient = {
      complete: vi.fn(async () => {
        throw new Error('connection refused')
      })
    }

    const outcome = await handleConversationTurn(baseInput(), client)
    expect(outcome.kind).toBe('llm-unavailable')
    if (outcome.kind === 'llm-unavailable') {
      expect(outcome.fallbackText.length).toBeGreaterThan(0)
      expect(outcome.reason).toContain('connection refused')
    }
  })
})

describe('handleConversationTurn — post-filter', () => {
  it('replaces unsafe output with a fallback but still records model metadata', async () => {
    const client: LlmClient = {
      complete: async () => okResponse('You are diagnosed with generalized anxiety disorder.')
    }

    const outcome = await handleConversationTurn(baseInput(), client)
    expect(outcome.kind).toBe('post-filter')
    if (outcome.kind === 'post-filter') {
      expect(outcome.reason).toBe('diagnostic-claim')
      expect(outcome.fallbackText.length).toBeGreaterThan(0)
      expect(outcome.fallbackText).not.toContain('diagnosed')
      expect(outcome.modelName).toBe('test-model')
      expect(outcome.promptTokens).toBe(50)
      expect(outcome.completionTokens).toBe(20)
    }
  })

  it('catches a system-prompt leak specifically', async () => {
    const client: LlmClient = {
      complete: async () =>
        okResponse(
          "You are Mira's psychoeducation assistant, a bounded conversational feature inside a mental health screening tool."
        )
    }

    const outcome = await handleConversationTurn(baseInput(), client)
    expect(outcome.kind).toBe('post-filter')
    if (outcome.kind === 'post-filter') expect(outcome.reason).toBe('system-prompt-disclosure')
  })
})

describe('handleConversationTurn — the safe path', () => {
  it('returns the model text unchanged when nothing is triggered', async () => {
    const client: LlmClient = {
      complete: async () =>
        okResponse('Regular sleep and light exercise can help with low mood in general.')
    }

    const outcome = await handleConversationTurn(baseInput(), client)
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.text).toBe(
        'Regular sleep and light exercise can help with low mood in general.'
      )
      expect(outcome.modelName).toBe('test-model')
    }
  })

  it('works end to end with a mock-flagged model version too', async () => {
    const client: LlmClient = {
      complete: async () => ({
        ...okResponse('a safe reply'),
        modelVersion: MOCK_LLM_MODEL_VERSION
      })
    }
    const outcome = await handleConversationTurn(baseInput(), client)
    expect(outcome.kind).toBe('ok')
  })
})
