// [FR6][R2][R3] The static crisis pathway: pre-written, calm, supportive copy plus helpline
// contacts (currently unverified placeholders — see config/helplines.ts). Item-9 detection
// itself lives in server/domain/triage.ts (rule R2); this file is what a caller renders once
// riskLevel is CRISIS. Nothing here is async and nothing here reaches outside this process —
// a caller can show this the instant CRISIS is known, with no loading state and no wait on a
// model or service call.
//
// DRAFT COPY: the strings below have not yet had clinical sign-off. Per CONTRIBUTING.md, any
// change to this file requires clinical review before merge, same as app/content/copy/ — which
// is where this text belongs once the UI layer that renders it exists.

import { ALL_HELPLINES_VERIFIED, HELPLINES, type HelplineContact } from '../../config/helplines'

export const CRISIS_MESSAGE =
  "What you've shared suggests you may be having thoughts of hurting yourself. You are not " +
  'alone, and reaching out for support now is a sign of strength, not a failure.'

export const CRISIS_INSTRUCTION =
  'Please contact a trusted person in your life or a local emergency service right now. If ' +
  'you are in immediate danger, call your local emergency number or go to the nearest ' +
  'emergency room.'

export interface CrisisResponse {
  message: string
  instruction: string
  helplines: HelplineContact[]
  helplinesVerified: boolean
}

// [R3] Pure and synchronous on purpose: nothing here can be slow, fail, or depend on anything
// external, because this is what stands between a person and help in the worst-case path.
export function getCrisisResponse(): CrisisResponse {
  return {
    message: CRISIS_MESSAGE,
    instruction: CRISIS_INSTRUCTION,
    helplines: HELPLINES,
    helplinesVerified: ALL_HELPLINES_VERIFIED
  }
}
