// [R6][R7] Re-exports the conversational layer's fallback copy from
// app/content/copy/conversation.ts — the single reviewable copy file per CONTRIBUTING.md. This
// module exists only so server/services/conversation/orchestrate.ts (which must not import
// from app/, a Nuxt-client-only tree, per CLAUDE.md's layering rules) can still reach that
// text: app/content/copy/conversation.ts is plain data with no Nuxt/Vue imports of its own, so
// importing it here is safe, just one directory hop removed from where it's actually used.
//
// DRAFT COPY: not yet clinically reviewed — see CONTRIBUTING.md before editing. Edit the text
// itself in app/content/copy/conversation.ts, not here.

export {
  FILTERED_RESPONSE_MESSAGE,
  LLM_UNAVAILABLE_MESSAGE,
  SESSION_LIMIT_MESSAGE
} from '../../app/content/copy/conversation'
