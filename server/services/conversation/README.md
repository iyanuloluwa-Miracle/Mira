# server/services/conversation

The bounded conversational layer (component 4, rule R6). `orchestrate.ts`'s
`handleConversationTurn()` is the orchestration: pre-filter -> session token budget -> LLM call
-> post-filter -> outcome. The pre-filter and post-filter themselves live in
[`server/domain/conversation-safety.ts`](../../domain/conversation-safety.ts) — deterministic,
zero-import, pure functions, not part of this service — so they're testable in isolation and
structurally cannot depend on a model or the network. See
[`docs/llm-safety-tests.md`](../../../docs/llm-safety-tests.md) for the adversarial evidence
that they work.

`system-prompt.ts` holds the reviewable system prompt. It is not the enforcement mechanism for
rule R6 — the filters are.

Two `LlmClient` implementations, selected by `LLM_MODE` (`config/runtime.ts`), same pattern as
`server/services/classifier/`:

- `mock-client.ts` — deterministic, no network call. The default, so a fresh clone and the test
  suite work without a real, billed API call.
- `anthropic-client.ts` — calls Anthropic's Messages API with a hard timeout and a per-turn
  `max_tokens` ceiling. Every response records the model name requested and the exact model
  string the API reports back, never assumed to be the same thing.

`server/api/conversation/[sessionId]/message.post.ts` is the only caller: it fetches session
context (risk band and rationale — never raw free text, never an identifier), calls
`handleConversationTurn()`, and persists the result. Nothing here has direct Prisma access,
which is what keeps this whole module testable with an injected client and no database.
