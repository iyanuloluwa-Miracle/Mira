// [R6][R7] The bounded conversational layer's orchestration: pre-filter -> session token
// budget -> LLM call -> post-filter -> outcome. No Prisma access here on purpose — this stays
// testable with an injected LlmClient and no database, mirroring server/services/classifier/
// index.ts's classify() seam. server/api/conversation/[sessionId]/message.post.ts is what
// fetches session context, calls this, and persists the result.
//
// `client` is a required parameter, not a lazily-created default: every caller must decide
// explicitly what it's talking to, which is what makes "the pre-filter path never invokes the
// LLM" a provable claim in tests rather than an inferred one — a test passes a client whose
// complete() would fail the test if called at all.

import { checkCrisisIndicators, checkOutputSafety } from '../../domain/conversation-safety'
import type { LlmMessage } from '../../domain/llm-contract'
import {
  FILTERED_RESPONSE_MESSAGE,
  LLM_UNAVAILABLE_MESSAGE,
  SESSION_LIMIT_MESSAGE
} from '../../../shared/copy/conversation'
import type { LlmClient } from './client'
import { CONVERSATION_SYSTEM_PROMPT } from './system-prompt'

// [R6] Hard ceilings, not env-configurable — see config/runtime.ts's LlmConfig for what *is*
// meant to be deployment-configurable (mode, timeout, model). These are safety constants: a
// per-turn cap is passed straight through as the provider's own maxTokens (a genuine hard stop
// on completion length, not a suggestion the model could ignore), and a per-session cap is
// checked before the LLM is called at all, the same "never call it" posture as the pre-filter.
export const PER_TURN_TOKEN_CEILING = 500
export const PER_SESSION_TOKEN_CEILING = 8000

export interface ConversationContext {
  riskLevel: string
  // [R6] Plain-language reasons from computeTriage — never the person's raw free text, never
  // an identifier. This is the entirety of what the LLM is told about the person.
  rationale: string[]
}

export interface ConversationTurnInput {
  userMessage: string
  context: ConversationContext
  // Prior turns' (already post-filter-approved) messages from this same session, oldest first.
  priorMessages: LlmMessage[]
  tokensUsedInSession: number
}

interface FilteredOutcomeFields {
  modelName: string
  modelVersion: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
}

export type ConversationTurnOutcome =
  | { kind: 'pre-filter'; reason: string }
  | { kind: 'session-limit'; fallbackText: string }
  | { kind: 'llm-unavailable'; fallbackText: string; reason: string }
  | ({ kind: 'post-filter'; reason: string; fallbackText: string } & FilteredOutcomeFields)
  | ({ kind: 'ok'; text: string } & FilteredOutcomeFields)

function buildContextMessage(context: ConversationContext): LlmMessage {
  return {
    role: 'system',
    content:
      `The person's current screening risk level is ${context.riskLevel}. The reasons behind ` +
      `that level: ${context.rationale.join(' ')}`
  }
}

export async function handleConversationTurn(
  input: ConversationTurnInput,
  client: LlmClient
): Promise<ConversationTurnOutcome> {
  // [R6][R7] Deterministic, synchronous, checked before anything else touches the network —
  // if this triggers, nothing below it ever runs.
  const preFilter = checkCrisisIndicators(input.userMessage)
  if (preFilter.triggered) {
    return { kind: 'pre-filter', reason: preFilter.reason! }
  }

  if (input.tokensUsedInSession >= PER_SESSION_TOKEN_CEILING) {
    return { kind: 'session-limit', fallbackText: SESSION_LIMIT_MESSAGE }
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
    buildContextMessage(input.context),
    ...input.priorMessages,
    { role: 'user', content: input.userMessage }
  ]

  let response
  try {
    response = await client.complete({ messages, maxTokens: PER_TURN_TOKEN_CEILING })
  } catch (error) {
    return {
      kind: 'llm-unavailable',
      fallbackText: LLM_UNAVAILABLE_MESSAGE,
      reason: error instanceof Error ? error.message : 'Unknown LLM error'
    }
  }

  const shared: FilteredOutcomeFields = {
    modelName: response.modelName,
    modelVersion: response.modelVersion,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    latencyMs: response.latencyMs
  }

  const postFilter = checkOutputSafety(response.text, CONVERSATION_SYSTEM_PROMPT)
  if (postFilter.triggered) {
    return {
      kind: 'post-filter',
      reason: postFilter.reason!,
      fallbackText: FILTERED_RESPONSE_MESSAGE,
      ...shared
    }
  }

  return { kind: 'ok', text: response.text, ...shared }
}
