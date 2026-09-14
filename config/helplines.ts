// Human-support contact information shown to users after escalation and on the crisis screen
// (server/domain/safety.ts).
//
// DEMO PLACEHOLDERS ONLY. These entries are shaped like real contacts for UI/demo purposes,
// but every phone value is deliberately non-dialable fiction and verified remains false.
// No real helpline number may be committed before a human has personally verified it with the
// organisation and recorded the verification date (rule R10). A wrong number on a crisis
// screen is the single worst failure this system can have — do not replace these with numbers
// from memory, a search result, or a model.
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
    name: '[Demo] National suicide/crisis prevention helpline',
    phone: '0000 000 0001',
    description:
      'Demo placeholder for a national crisis line. Not a real organisation or dialable number.',
    availability: 'Demo only — shown as 24/7',
    verified: false
  },
  {
    name: '[Demo] Emergency services',
    phone: '0000 000 0002',
    description:
      'Demo placeholder for emergency services. Not a real or dialable emergency number.',
    availability: 'Demo only — shown as 24/7',
    verified: false
  },
  {
    name: '[Demo] Local mental health crisis line',
    phone: '0000 000 0003',
    description:
      'Demo placeholder for a local crisis line. Not a real organisation or dialable number.',
    availability: 'Demo only — shown as daytime hours',
    verified: false
  }
]

// True only once every entry above has verified: true. server/plugins/warn-unverified-
// helplines.ts logs a startup warning while this is false in non-production; the persistent
// on-screen banner is a UI concern for the crisis screen once it's built (later prompt) and
// should read this same flag.
export const ALL_HELPLINES_VERIFIED = HELPLINES.every((helpline) => helpline.verified)
