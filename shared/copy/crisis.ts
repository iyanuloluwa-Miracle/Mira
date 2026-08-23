// [R3] Re-exports the crisis message/instruction from app/content/copy/postScreening.ts — the
// single reviewable copy file per CONTRIBUTING.md ("every string a distressed user might read
// ... rule R3"). This module exists only so server/domain/safety.ts (which must not import
// from app/, a Nuxt-client-only tree, per CLAUDE.md's layering rules) can still reach that text:
// app/content/copy/postScreening.ts is plain data with no Nuxt/Vue imports of its own, so
// importing it here is safe, just one directory hop removed from the domain layer that actually
// uses it.
//
// DRAFT COPY: not yet clinically reviewed — see CONTRIBUTING.md before editing. Edit the text
// itself in app/content/copy/postScreening.ts, not here.

export { CRISIS_INSTRUCTION, CRISIS_MESSAGE } from '../../app/content/copy/postScreening'
