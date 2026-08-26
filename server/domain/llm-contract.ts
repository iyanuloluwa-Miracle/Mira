// [R6][R7] Shared types describing the input/output contract between the bounded conversational
// layer's orchestration (server/services/conversation/) and whichever LLM client implements it
// — kept here, not in the service module, so server/domain never needs to import a service
// directly. Deliberately zero imports, same discipline as model-contract.ts.

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  messages: LlmMessage[]
  // Per-turn token ceiling (server/services/conversation/orchestrate.ts) — passed straight
  // through as the provider's own hard stop on completion length, not a suggestion.
  maxTokens: number
}

export interface LlmResponse {
  text: string
  // [R6] Recorded on every call, real or mock — see MOCK_LLM_MODEL_VERSION below for why a
  // mock response can never be mistaken for a real one.
  modelName: string
  modelVersion: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
}

// [R7] Never throws and never blocks a conversation turn — orchestrate.ts always resolves to
// one of these two outcomes. 'unavailable' covers every failure mode indistinguishably
// (timeout, connection error, non-2xx, malformed response), same pattern as
// server/domain/model-contract.ts's ClassifierOutcome.
export type LlmOutcome =
  { status: 'ok'; response: LlmResponse } | { status: 'unavailable'; reason: string }

// Every mock response carries this exact modelVersion so a mock result can never be mistaken
// for a real model's output in the database or in an evaluation write-up.
export const MOCK_LLM_MODEL_VERSION = 'mock-conversation-0.1'
