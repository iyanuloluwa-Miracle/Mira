# server/api/conversation

`POST /api/conversation/[sessionId]/message` — the bounded conversational layer's one endpoint.

Fetches the session's triage result (for risk band and rationale — the only context the LLM
ever sees) and the caller's own already-approved `priorMessages` (sent with each request, not
reloaded from storage — see `server/services/conversation/README.md` for why), then delegates
to `handleConversationTurn()`. Persists a `ConversationTurn` row for every call regardless of
outcome (turn count, latency, filter outcomes, token counts always; the transcript itself only
when the user has separately granted `RESEARCH_LOGGING` consent, encrypted the same way as
`FreeTextEntry`). Writes an `AuditLog` entry, with the filter's reason but never the content,
whenever the pre-filter or post-filter fires.

The pre-filter and post-filter themselves are not here — see
`server/domain/conversation-safety.ts` and `docs/llm-safety-tests.md`.
