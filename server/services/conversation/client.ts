// The one interface every LLM provider implementation satisfies — kept separate from index.ts
// so mock-client.ts and anthropic-client.ts can both import it without importing each other.
// "Provider-agnostic" means this: orchestrate.ts and everything above it only ever depends on
// this interface, never on a specific provider's SDK or wire format.

import type { LlmRequest, LlmResponse } from '../../domain/llm-contract'

export interface LlmClient {
  // Throws on any failure (network error, timeout, non-2xx, malformed response). index.ts's
  // orchestration is what turns that into the never-throws LlmOutcome contract callers see.
  complete(request: LlmRequest): Promise<LlmResponse>
}
