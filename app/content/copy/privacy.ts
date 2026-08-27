// [NFR1] Every user-facing string for the privacy dashboard (app/pages/privacy/my-data.vue)
// and the public privacy notice (app/pages/privacy/index.vue). Kept in one file, same
// convention as app/content/copy/postScreening.ts, so a supervisor or clinician reviewer can
// read and sign off this wording without reading code — and, per CONTRIBUTING.md's blanket
// app/content/copy/ rule, any change here requires the same review.

// ---------------------------------------------------------------------------------------------
// DASHBOARD — /privacy/my-data
// ---------------------------------------------------------------------------------------------

export const DASHBOARD_TITLE = 'Your data'
export const DASHBOARD_INTRO =
  'What Mira stores about this account, in plain language, and the controls you have over it.'

export const DASHBOARD_STORED_HEADING = 'What is stored'

export const DASHBOARD_EXPORT_HEADING = 'Export your data'
export const DASHBOARD_EXPORT_INTRO =
  'Download everything listed above as a single file you can keep, inspect, or take elsewhere.'
export const DASHBOARD_EXPORT_BUTTON_LABEL = 'Download my data (JSON)'
export const DASHBOARD_EXPORT_ERROR_MESSAGE = "That download didn't work. Please try again."

export const DASHBOARD_CONSENT_HEADING = 'Consent'
export const DASHBOARD_CONSENT_INTRO =
  'Each of these takes effect immediately — on or off. You can change your mind at any time.'
export const CONSENT_PURPOSE_LABELS: Record<string, string> = {
  SCREENING: 'Screening',
  RESEARCH_LOGGING: 'Research logging',
  HUMAN_REVIEW: 'Human review'
}
export const CONSENT_PURPOSE_EFFECTS: Record<string, string> = {
  SCREENING:
    'Recorded for transparency only. Screening itself is never blocked by this — you can always use Mira anonymously, on or off.',
  RESEARCH_LOGGING:
    'When on, your conversation with the assistant is stored (encrypted) to help improve Mira. When off, only turn counts and timing are kept — never the message text.',
  HUMAN_REVIEW:
    'When on, a screening result that suggests you would benefit from professional support can be shared with our clinician team, including anything you wrote. When off, no identifiable record is created for review, and turning it off immediately hides any written response already shared from clinicians — the record of the case itself is not deleted.'
}
export const CONSENT_TOGGLE_ERROR_MESSAGE = "That change didn't save. Please try again."

export const DASHBOARD_DELETE_HEADING = 'Delete your account'
export const DASHBOARD_DELETE_INTRO =
  'Permanently deletes this account and every record linked to it — screening sessions, ' +
  'written responses, conversation history, consent history, and any clinician review record. ' +
  'This cannot be undone.'
export const DASHBOARD_DELETE_BUTTON_LABEL = 'Delete my account'
export const DASHBOARD_DELETE_CONFIRM_LABEL = (pseudonym: string): string =>
  `Type your pseudonym (${pseudonym}) to confirm`
export const DASHBOARD_DELETE_CONFIRM_BUTTON_LABEL = 'Permanently delete'
export const DASHBOARD_DELETE_CANCEL_BUTTON_LABEL = 'Cancel'
export const DASHBOARD_DELETE_ERROR_MESSAGE =
  "That didn't work. Check you typed your pseudonym exactly, then try again."
export const DASHBOARD_DELETE_SUCCESS_MESSAGE =
  'Your account and all linked data have been deleted.'

export const DASHBOARD_LOAD_ERROR_MESSAGE = "We couldn't load your data summary."

// ---------------------------------------------------------------------------------------------
// PUBLIC NOTICE — /privacy
// ---------------------------------------------------------------------------------------------

export const NOTICE_TITLE = 'Privacy notice'
export const NOTICE_INTRO =
  'This is a specific, working description of how Mira handles your data — not a generic ' +
  'template. If anything here does not match what the app actually does, that is a bug; ' +
  'please report it.'

export const NOTICE_WHO_HEADING = 'Who this covers'
export const NOTICE_WHO_BODY =
  'Anyone who uses Mira, whether anonymously or with a registered account. Anonymous use is ' +
  'always available and is never a lesser-privacy option — the same controls on this page ' +
  'apply either way, tied to your pseudonym rather than your name.'

export const NOTICE_PURPOSE_HEADING = 'Why we process your data'
export const NOTICE_PURPOSE_POINTS = [
  'To administer the PHQ-9 and GAD-7 screening questionnaires and compute your result.',
  'To route an escalate-worthy result toward psychoeducational resources or, with your separate consent, human clinical follow-up.',
  'To operate the bounded conversational layer that explains your result and general coping information.',
  'To keep a record sufficient to demonstrate that safety-critical decisions (like a crisis escalation) were handled correctly.'
]

export const NOTICE_LAWFUL_BASIS_HEADING = 'Lawful basis'
export const NOTICE_LAWFUL_BASIS_BODY =
  'Screening itself relies on your consent to use the app, given by starting a screening — ' +
  'never conditioned on registering an account. Sharing an escalate-worthy result with a ' +
  'human clinician relies on your separate, explicit, revocable consent (the "Human review" ' +
  'toggle on your data page), given either in advance or after seeing your result. Where a ' +
  'result indicates an immediate risk to life (rule R2 in this project), showing you crisis ' +
  'information and helpline contacts relies on our legitimate interest in your safety, and ' +
  'happens regardless of any consent setting.'

export const NOTICE_CATEGORIES_HEADING = 'Categories of data we process'
export const NOTICE_CATEGORIES_POINTS = [
  'Screening answers, computed scores, and risk bands.',
  'Optional free-text you choose to write, encrypted at rest.',
  'Conversation turn metadata always; message text only with research-logging consent.',
  'Consent decisions and their timestamps.',
  'A pseudonym generated for your account — never your name unless you choose to register with an email, which is itself never stored as readable text.',
  'For a registered account: an email address, stored as a one-way keyed hash for login plus a separately encrypted copy used only to contact you.'
]

export const NOTICE_RETENTION_HEADING = 'How long we keep it'
export const NOTICE_RETENTION_POINTS = [
  'Written free-text responses: deleted automatically 90 days after you write them. Your computed score and band are unaffected — only the raw text is removed.',
  'Screening sessions you start but never finish: deleted automatically 30 days after you start them.',
  'Internal audit log entries (who did what, never what you wrote): deleted automatically after 12 months.',
  'Everything else tied to your account: kept until you delete your account, or you can delete a single screening result immediately from its result page.'
]

export const NOTICE_RIGHTS_HEADING = 'Your rights, and where to exercise them'
export const NOTICE_RIGHTS_ACCESS =
  'Access and portability — see and download everything stored about you.'
export const NOTICE_RIGHTS_ERASURE =
  'Erasure — permanently delete your account and every linked record, immediately.'
export const NOTICE_RIGHTS_WITHDRAW = 'Withdraw consent — per purpose, taking effect immediately.'
export const NOTICE_RIGHTS_LINK_LABEL = 'Go to your data'
export const NOTICE_RIGHTS_NOT_YET_HEADING = 'Not yet available through this interface'
export const NOTICE_RIGHTS_NOT_YET_POINTS = [
  'Correction/rectification of a stored answer or score — currently, the only way to correct a result is to delete it and screen again.',
  'Restriction of processing short of full deletion — Mira currently offers full erasure or per-purpose consent withdrawal, not a partial "pause processing but keep the data" state.'
]

export const NOTICE_CONTACT_HEADING = 'Contact'
export const NOTICE_CONTACT_BODY =
  'This is a thesis research prototype, not a deployed clinical service. A production ' +
  'deployment would list a named data controller and a real contact address here; this build ' +
  'does not, since none has been assigned yet — see docs/ndpa-mapping.md for how this gap is ' +
  'tracked.'
