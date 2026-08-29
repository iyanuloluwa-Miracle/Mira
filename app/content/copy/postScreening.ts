// [FR4][FR6][NFR5][R3] Every user-facing sentence for the two screens shown after a screening
// is completed: the result page (app/pages/result/[sessionId].vue) and the crisis interrupt
// (app/components/safety/CrisisScreen.vue). This is the single file to read to review that
// wording — nothing in either screen's template should be a hand-written sentence that isn't
// exported from here.
//
// DRAFT COPY: not yet clinically reviewed. Per CONTRIBUTING.md, any change to this file
// requires clinical review before merge, same as config/helplines.ts and server/domain/safety.ts.
//
// Ground rules this file follows throughout (do not relax these when editing):
//   - Never state or imply a diagnosis. "Your answers suggest" / "may indicate", never "you have".
//   - Never name a disorder as a conclusion about the person — "symptoms of depression", not
//     "you are depressed".
//   - Plain language over clinical register. Short sentences, especially on the crisis screen.

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — band descriptions
// ---------------------------------------------------------------------------------------------
// Keyed exactly by the band strings server/domain/scoring.ts's phq9Band()/gad7Band() produce.
// If those bands ever change, these keys must change with them.

export const PHQ9_BAND_PHRASES: Record<string, string> = {
  MINIMAL: 'minimal symptoms of depression',
  MILD: 'mild symptoms of depression',
  MODERATE: 'moderate symptoms of depression',
  MODERATELY_SEVERE: 'moderately severe symptoms of depression',
  SEVERE: 'severe symptoms of depression'
}

export const GAD7_BAND_PHRASES: Record<string, string> = {
  MINIMAL: 'minimal symptoms of anxiety',
  MILD: 'mild symptoms of anxiety',
  MODERATE: 'moderate symptoms of anxiety',
  SEVERE: 'severe symptoms of anxiety'
}

// The band phrases above are combined into one sentence like:
//   "Your answers suggest moderate symptoms of depression and mild symptoms of anxiety."
export const RESULT_BAND_INTRO_PREFIX = 'Your answers suggest'

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — numeric scores
// ---------------------------------------------------------------------------------------------

export const PHQ9_SCORE_LABEL = 'Depression (PHQ-9)'
export const GAD7_SCORE_LABEL = 'Anxiety (GAD-7)'
export const PHQ9_SCORE_RANGE_LABEL = 'out of a possible 0–27'
export const GAD7_SCORE_RANGE_LABEL = 'out of a possible 0–21'

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — rationale section
// ---------------------------------------------------------------------------------------------

export const RATIONALE_HEADING = 'How we got this result'
export const RATIONALE_INTRO = "Here's what your answers were based on:"

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — what this result is not
// ---------------------------------------------------------------------------------------------

export const NOT_A_DIAGNOSIS_HEADING = 'What this result is not'
export const NOT_A_DIAGNOSIS_POINTS = [
  'This is not a diagnosis.',
  'It is not a substitute for care from a qualified professional.',
  'Only a licensed clinician can diagnose a mental health condition.'
]
export const NOT_A_DIAGNOSIS_CLOSING =
  'Mira is a screening tool. It is meant to help you understand your answers and point you ' +
  'toward the right kind of support next — not to tell you what is wrong.'

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — next steps (FR5 resource recommendations)
// ---------------------------------------------------------------------------------------------

export const NEXT_STEPS_HEADING = 'Next steps'
export const NEXT_STEPS_INTRO =
  'A few resources picked for this result — or browse the full library any time from the ' +
  'Resources link, whether or not you have completed a screening.'
// Not expected in normal operation (server/domain/resources.ts guarantees a non-empty list for
// every risk level given the current content set) — kept as an honest fallback rather than
// silently rendering an empty section if it ever were.
export const NEXT_STEPS_EMPTY_FALLBACK =
  'Resource matching is temporarily unavailable. In the meantime, consider talking to someone ' +
  'you trust, or a licensed counsellor, about how you have been feeling.'

// ---------------------------------------------------------------------------------------------
// FREE-TEXT STEP — after the instruments, before finishing (FR3)
// ---------------------------------------------------------------------------------------------

export const FREE_TEXT_HEADING = 'In your own words, how have the last two weeks been?'
export const FREE_TEXT_OPTIONAL_LABEL = 'Optional'
export const FREE_TEXT_EXPLANATION =
  'This is entirely optional and never required to finish your screening. If you write ' +
  'something, it is encrypted, and a supplementary model looks at it alongside your answers — ' +
  'it can only ever nudge your result up by one level, never set or lower it on its own. You ' +
  'can also delete everything from this screening at any time from your result.'
export const FREE_TEXT_CHARACTER_GUIDE = (remaining: number): string =>
  `${remaining} characters left`
export const FREE_TEXT_PLACEHOLDER = "Whatever feels relevant — there's no right answer."
export const FREE_TEXT_CONTINUE_LABEL = 'Continue'
export const FREE_TEXT_SKIP_LABEL = "Skip — I'd rather not write anything"
export const FREE_TEXT_SUBMIT_ERROR =
  "We couldn't save what you wrote. Please try again, or skip this step."

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — the text-analysis explanation (NFR5)
// ---------------------------------------------------------------------------------------------

export const TEXT_ANALYSIS_HEADING = 'What your written answer showed'
export const TEXT_ANALYSIS_EXPLANATION =
  'The highlighted words are what the model paid the most attention to in what you wrote. ' +
  'This shows what it attended to — it is not a clinical judgement.'
export const TEXT_ANALYSIS_TEXT_FREE_MESSAGE =
  'This result is based on your questionnaire answers only — no written response was analysed.'
export const TEXT_ANALYSIS_UNAVAILABLE_MESSAGE =
  'Text analysis was unavailable for what you wrote; this result is based on your ' +
  'questionnaire answers alone.'

// ---------------------------------------------------------------------------------------------
// RESULT PAGE — deleting this session's data
// ---------------------------------------------------------------------------------------------

export const DELETE_SESSION_BUTTON_LABEL = 'Delete this result'
export const DELETE_SESSION_CONFIRM_PROMPT =
  "This permanently deletes your answers and this result. This can't be undone."
export const DELETE_SESSION_CONFIRM_BUTTON_LABEL = 'Yes, delete it'
export const DELETE_SESSION_CANCEL_BUTTON_LABEL = 'Keep it'
export const DELETE_SESSION_SUCCESS_MESSAGE = 'This result has been deleted.'
export const DELETE_SESSION_ERROR_MESSAGE = "We couldn't delete this result. Please try again."

// ---------------------------------------------------------------------------------------------
// CRISIS SCREEN — headline and body
// ---------------------------------------------------------------------------------------------
// Calm, short sentences throughout — this is read by someone who may be in acute distress.
// No scores, no bands, no percentages anywhere on this screen.

export const CRISIS_HEADLINE = "You're not alone"

export const CRISIS_BODY_LINES = [
  'Some of your answers suggest you may be thinking about hurting yourself.',
  "That took courage to share, and you don't have to go through this alone."
]

export const CRISIS_ENCOURAGEMENT =
  'Please reach out to someone you trust, or a local emergency service, right now.'

export const CRISIS_IMMEDIATE_DANGER =
  "If you're in immediate danger, call your local emergency number or go to the nearest " +
  'emergency room.'

// Combined single-paragraph forms, kept for callers (e.g. server/domain/safety.ts) that want
// one string rather than the line-by-line arrays above.
export const CRISIS_MESSAGE = CRISIS_BODY_LINES.join(' ')
export const CRISIS_INSTRUCTION = `${CRISIS_ENCOURAGEMENT} ${CRISIS_IMMEDIATE_DANGER}`

// ---------------------------------------------------------------------------------------------
// CRISIS SCREEN — helpline contacts
// ---------------------------------------------------------------------------------------------

export const CRISIS_HELPLINES_HEADING = 'Support contacts'
export const CRISIS_HELPLINES_UNVERIFIED_NOTICE =
  'The contacts below are placeholders pending verification and are not yet real, dialable ' +
  'numbers.'

// ---------------------------------------------------------------------------------------------
// CRISIS SCREEN — leaving and returning
// ---------------------------------------------------------------------------------------------

export const CRISIS_CONTINUE_LABEL = 'Continue to the rest of Mira'
export const CRISIS_PERSISTENT_CONTROL_LABEL = 'I need help now'
