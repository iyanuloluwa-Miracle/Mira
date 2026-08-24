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
