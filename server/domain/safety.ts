// [FR6][R2][R3] The static crisis pathway: pre-written, calm, supportive copy plus helpline
// contacts (currently unverified placeholders — see config/helplines.ts). Item-9 detection
// itself lives in server/domain/triage.ts (rule R2); this file is what a caller renders once
// riskLevel is CRISIS. Nothing here is async and nothing here reaches outside this process —
// a caller can show this the instant CRISIS is known, with no loading state and no wait on a
// model or service call.
//
// The message/instruction text lives in shared/copy/crisis.ts, not here, so
// app/pages/support/crisis.vue can use the exact same strings without importing anything from
// server/domain/ (which would cross the client/server boundary) or fetching them over the
// network (which rule R3 forbids for this path). Re-exported below so existing imports of
// CRISIS_MESSAGE/CRISIS_INSTRUCTION from this file keep working unchanged.
//
// DRAFT COPY: not yet clinically reviewed. Per CONTRIBUTING.md, any change requires clinical
// review before merge, same as app/content/copy/.

import { ALL_HELPLINES_VERIFIED, HELPLINES, type HelplineContact } from '../../config/helplines'
import { CRISIS_INSTRUCTION, CRISIS_MESSAGE } from '../../shared/copy/crisis'

export { CRISIS_INSTRUCTION, CRISIS_MESSAGE }

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
