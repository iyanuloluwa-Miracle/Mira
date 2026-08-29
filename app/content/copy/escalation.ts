// [FR6][R3] Every user-facing sentence for the escalation referral screen
// (app/components/safety/ReferralScreen.vue), shown for a HIGH-risk (escalate=true,
// non-CRISIS) result. Same ground rules as app/content/copy/postScreening.ts: never state or
// imply a diagnosis, plain language over clinical register, short sentences.
//
// DRAFT COPY: not yet clinically reviewed. Per CONTRIBUTING.md, any change to this file
// requires clinical review before merge, same as the rest of app/content/copy/.

export const REFERRAL_HEADING = 'You may benefit from talking to someone'
export const REFERRAL_INTRO =
  'Your answers suggest you may be going through something that talking to a professional ' +
  'could help with. This is not a diagnosis — it is a signal worth taking seriously.'

export const REFERRAL_WHAT_HAPPENS_NEXT_HEADING = 'What happens next'
export const REFERRAL_ALREADY_SHARED_BODY =
  'You have already agreed to share this result with our clinician team. Someone will review ' +
  'it and may reach out through the contact details on your account, where available.'
export const REFERRAL_NOT_SHARED_BODY =
  "We have not shared this result with anyone. If you'd like a clinician on our team to look " +
  'at it, you can choose to share it below — or reach out yourself using the contacts listed ' +
  'here.'

export const REFERRAL_CLINICIAN_SEES_HEADING = 'If you share this, a clinician will see'
export const REFERRAL_CLINICIAN_SEES_POINTS = [
  'A pseudonym — never your name, email, or any other identifying detail.',
  'Your screening band and scores, and the reasons behind them.',
  'What you wrote in the optional free-text step, if you wrote anything.'
]

export const REFERRAL_CLINICIAN_NOT_SEE_HEADING = 'A clinician will never see'
export const REFERRAL_CLINICIAN_NOT_SEE_POINTS = [
  'Your name, email address, or any other real identifier.',
  'Anything from this screening if you choose not to share it.'
]

export const REFERRAL_SHARE_BUTTON_LABEL = 'Share this with a clinician'
export const REFERRAL_SHARE_PENDING_LABEL = 'Sharing…'
export const REFERRAL_SHARE_ERROR_MESSAGE =
  "We couldn't share this right now. You can try again, or use the contacts below instead."
export const REFERRAL_SHARE_SUCCESS_MESSAGE =
  'Shared. Someone from our clinician team will follow up.'

// [R10] Shown either way, shared or not — this is the "must still see the referral
// information and helplines" half of the consent-aware requirement, and it never depends on
// whether sharing succeeded.
export const REFERRAL_HELPLINES_HEADING = 'Reach out directly'
export const REFERRAL_HELPLINES_INTRO =
  'You do not need to wait for us — these are ways to reach a professional yourself, any time.'
