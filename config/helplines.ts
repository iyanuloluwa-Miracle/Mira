// Human-support contact information shown to users after escalation and on the crisis screen
// (server/domain/safety.ts).
//
// PLACEHOLDER VALUES ONLY. Every entry below is marked TODO_VERIFY and must not be treated as
// real, dialable, or currently staffed — no real helpline number may be committed before a
// human has personally verified it (rule R10). A wrong number on a crisis screen is the single
// worst failure this system can have; do not fill these in from memory, a search result, or a
// model — verify directly with the organisation and record the verification date.
// Changes require clinical review — see CONTRIBUTING.md.

export interface HelplineContact {
  name: string
  phone: string
  description: string
  availability: string
  verified: boolean
}

export const HELPLINES: HelplineContact[] = [
  {
    name: 'TODO_VERIFY: National suicide/crisis prevention helpline',
    phone: 'TODO_VERIFY',
    description: 'TODO_VERIFY — confirm scope, catchment area, and current operating status.',
    availability: 'TODO_VERIFY',
    verified: false
  },
  {
    name: 'TODO_VERIFY: Emergency services',
    phone: 'TODO_VERIFY',
    description: 'TODO_VERIFY',
    availability: 'TODO_VERIFY',
    verified: false
  },
  {
    name: 'TODO_VERIFY: Local mental health crisis line',
    phone: 'TODO_VERIFY',
    description: 'TODO_VERIFY',
    availability: 'TODO_VERIFY',
    verified: false
  }
]

// True only once every entry above has verified: true. server/plugins/warn-unverified-
// helplines.ts logs a startup warning while this is false in non-production; the persistent
// on-screen banner is a UI concern for the crisis screen once it's built (later prompt) and
// should read this same flag.
export const ALL_HELPLINES_VERIFIED = HELPLINES.every((helpline) => helpline.verified)
