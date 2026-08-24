// [R6][R7] Every user-facing sentence the bounded conversational layer can show instead of a
// model's own words — what a person sees when the pre-filter routes them to the crisis page,
// when the LLM is unavailable, when a session's token budget is exhausted, or when the
// post-filter has rejected a response. Kept in one file, same convention as
// app/content/copy/postScreening.ts, so a supervisor or clinician reviewer can read and sign
// off this wording without reading code.
//
// DRAFT COPY: not yet clinically reviewed. Per CONTRIBUTING.md, any change to this file
// requires clinical review before merge, same as config/helplines.ts and
// server/services/conversation/system-prompt.ts.

// [R7] Shown when the LLM could not be reached at all (timeout, provider error, unset API
// key) — the conversation degrades rather than fails; this is what the person sees instead of
// an error.
export const LLM_UNAVAILABLE_MESSAGE =
  "I'm not able to respond right now. You can still review your screening result, and the " +
  'psychoeducational resources on your result page are always available.'

// [R6] Shown whenever the post-filter rejects a model response, regardless of which of its
// checks fired — the person is never shown *which* rule was tripped, only redirected toward
// what the assistant can actually help with.
export const FILTERED_RESPONSE_MESSAGE =
  "I'm not able to answer that in the way you've asked. I can help explain what your " +
  'screening measured, share general information about depression and anxiety, or talk ' +
  'through general coping strategies — would one of those help?'

// [R6][R7] Shown when a session reaches its token budget (config/runtime.ts-adjacent constant
// in server/services/conversation/orchestrate.ts) — the LLM is not called for this turn at all.
export const SESSION_LIMIT_MESSAGE =
  "We've reached the limit for this conversation. If you'd like to keep talking things " +
  'through, reaching out to a licensed professional is a good next step.'

// ---------------------------------------------------------------------------------------------
// [R6] Chat page chrome — never generated, always on screen. The header disclaimer is the
// single most load-bearing sentence on this page for the thesis defence: it must state, in one
// reading with no scrolling, that this is automated, not a therapist, and not for emergencies.
export const CHAT_HEADER_TITLE = 'Talk it through'
export const CHAT_HEADER_DISCLAIMER =
  'Automated assistant for general information. Not a therapist. Not for emergencies.'

export const CHAT_INPUT_PLACEHOLDER = 'Ask a question…'
export const CHAT_SEND_BUTTON_LABEL = 'Send'
export const CHAT_BACK_TO_RESULT_LABEL = 'Back to your result'

// [FR3] Starting points only — never sent as-is without the person choosing to send them, and
// never the only way to start (the input is always usable directly).
export const CHAT_SUGGESTED_PROMPTS = [
  'What does my score mean?',
  'What is anxiety?',
  'How do I talk to someone about this?'
]

export const CHAT_EMPTY_STATE_INTRO =
  'You can ask about what your screening measured, general information about depression and ' +
  'anxiety, or how to talk to someone about how you have been feeling.'

// Shown only when the request itself failed (network error, service unreachable) — distinct
// from LLM_UNAVAILABLE_MESSAGE above, which is a normal, graceful degraded reply from the
// server. This one means the person got no reply at all, so it always offers a way out.
export const CHAT_NETWORK_ERROR_MESSAGE =
  "That message didn't send. You can try again, or go back to your result and resources."
