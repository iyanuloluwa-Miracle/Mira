// [FR7] User-facing copy for the clinician dashboard — staff-facing, not shown to a person
// being screened, so it doesn't carry the same "never state a diagnosis" constraints as
// app/content/copy/postScreening.ts, but is kept in its own file for the same reason: one
// place to read every string a screen shows.

export const CLINICIAN_LOGIN_TITLE = 'Clinician sign in'
export const CLINICIAN_LOGIN_EMAIL_LABEL = 'Email'
export const CLINICIAN_LOGIN_PASSWORD_LABEL = 'Password'
export const CLINICIAN_LOGIN_BUTTON_LABEL = 'Sign in'
export const CLINICIAN_LOGIN_ERROR_MESSAGE = 'Incorrect email or password.'

export const CLINICIAN_QUEUE_TITLE = 'Escalation queue'
export const CLINICIAN_QUEUE_EMPTY_MESSAGE = 'No escalations match this filter.'
export const CLINICIAN_QUEUE_FILTER_LABEL = 'Status'
export const CLINICIAN_QUEUE_FILTER_ALL_LABEL = 'All'
export const CLINICIAN_LOGOUT_LABEL = 'Sign out'

export const CLINICIAN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  CONTACTED: 'Contacted',
  CLOSED: 'Closed'
}

export const CLINICIAN_DETAIL_PSEUDONYM_LABEL = 'Pseudonym'
export const CLINICIAN_DETAIL_RATIONALE_HEADING = 'Rationale'
export const CLINICIAN_DETAIL_FREE_TEXT_HEADING = 'Free text'
export const CLINICIAN_DETAIL_FREE_TEXT_NOT_SUBMITTED = 'No free text was submitted.'
export const CLINICIAN_DETAIL_FREE_TEXT_WITHHELD =
  'Withheld by user consent — this person has not (or no longer) consented to human review of ' +
  'their written response.'
export const CLINICIAN_DETAIL_NOTES_HEADING = 'Clinician notes'
export const CLINICIAN_DETAIL_NOTES_PLACEHOLDER = 'Add or update your notes on this case…'
export const CLINICIAN_DETAIL_NOTES_SAVE_LABEL = 'Save notes'
export const CLINICIAN_DETAIL_STATUS_HEADING = 'Status'
export const CLINICIAN_DETAIL_SAVE_ERROR_MESSAGE = "That didn't save. Please try again."

export const CLINICIAN_RESOURCES_TITLE = 'Resource management'
export const CLINICIAN_RESOURCES_NEW_BUTTON_LABEL = 'New resource'
export const CLINICIAN_RESOURCES_SAVE_LABEL = 'Save'
export const CLINICIAN_RESOURCES_ACTIVATE_LABEL = 'Activate'
export const CLINICIAN_RESOURCES_DEACTIVATE_LABEL = 'Deactivate'
export const CLINICIAN_RESOURCES_FORBIDDEN_MESSAGE =
  'Resource management requires an admin account.'
