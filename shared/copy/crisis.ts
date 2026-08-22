// [R3] The static crisis pathway's message text — the single source both server (triage/safety
// API responses) and client (the always-available crisis page, app/pages/support/crisis.vue)
// import directly, so there is no version to fetch and nothing that can be "loading". Plain
// data in shared/ rather than server/domain/ specifically so client code can import it without
// crossing the server/domain purity boundary (CLAUDE.md) or pulling any server-only module
// into the client bundle.
//
// DRAFT COPY: not yet clinically reviewed — see CONTRIBUTING.md before editing.

export const CRISIS_MESSAGE =
  "What you've shared suggests you may be having thoughts of hurting yourself. You are not " +
  'alone, and reaching out for support now is a sign of strength, not a failure.'

export const CRISIS_INSTRUCTION =
  'Please contact a trusted person in your life or a local emergency service right now. If ' +
  'you are in immediate danger, call your local emergency number or go to the nearest ' +
  'emergency room.'
