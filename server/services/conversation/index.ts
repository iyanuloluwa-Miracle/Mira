// [R6][R7] Client factory for the bounded conversational layer, mirroring
// server/services/classifier/index.ts's createClassifierClient() pattern. Orchestration itself
// (handleConversationTurn) takes its client as a required parameter rather than reaching for a
// module-level default — see orchestrate.ts for why — so this factory exists purely for
// server/api/conversation/ to call once per request.

import { getLlmConfig } from '../../../config/runtime'
import { AnthropicClient } from './anthropic-client'
import type { LlmClient } from './client'
import { MockLlmClient } from './mock-client'

export type { LlmClient } from './client'
export { AnthropicClient } from './anthropic-client'
export { MockLlmClient } from './mock-client'
export {
  handleConversationTurn,
  PER_SESSION_TOKEN_CEILING,
  PER_TURN_TOKEN_CEILING,
  type ConversationContext,
  type ConversationTurnInput,
  type ConversationTurnOutcome
} from './orchestrate'

export function createLlmClient(): LlmClient {
  const config = getLlmConfig()
  if (config.mode === 'http' && config.apiKey) {
    return new AnthropicClient({
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs
    })
  }
  return new MockLlmClient()
}
