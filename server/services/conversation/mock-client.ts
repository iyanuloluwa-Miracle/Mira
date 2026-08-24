// [R6][R7] A deterministic stand-in for a real LLM — no network call, safe for a fresh clone,
// local dev, and demos. Every response carries modelVersion MOCK_LLM_MODEL_VERSION
// ("mock-conversation-0.1"), defined once in server/domain/llm-contract.ts, so a mock reply can
// never be mistaken for a real model's output.
//
// This is not what the adversarial suite (docs/llm-safety-tests.md) uses to test the post-
// filter — those tests inject their own stub LlmClient returning the exact adversarial text
// under test, so the filter is proven against specific unsafe strings, not against whatever
// this canned response happens to say. This client exists for local running/manual smoke
// testing of the conversation flow end to end.

import { MOCK_LLM_MODEL_VERSION } from '../../domain/llm-contract'
import type { LlmRequest, LlmResponse } from '../../domain/llm-contract'
import type { LlmClient } from './client'

const MOCK_REPLY =
  'Thanks for sharing that. In general, it can help to keep a consistent sleep schedule, ' +
  'get some physical activity most days, and stay connected with people you trust. If ' +
  "you'd like, I can explain more about what your screening measured, or what depression " +
  'and anxiety are in general terms. If you ever want to talk to someone directly, ' +
  'reaching out to a licensed professional is a good next step.'

export class MockLlmClient implements LlmClient {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const start = Date.now()
    const promptTokens = request.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    const completionTokens = estimateTokens(MOCK_REPLY)

    return {
      text: MOCK_REPLY,
      modelName: 'mira-mock-conversation',
      modelVersion: MOCK_LLM_MODEL_VERSION,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - start
    }
  }
}

// Rough, deterministic estimate (no tokenizer dependency for a mock) — about 4 characters per
// token, a commonly-cited approximation for English text.
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
