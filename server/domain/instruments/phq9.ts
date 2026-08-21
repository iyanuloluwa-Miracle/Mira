// [FR2] Validated PHQ-9 (Patient Health Questionnaire-9) item wording and response options, as
// plain data — the item text below is reproduced exactly as validated and must not be
// paraphrased; construct validity depends on administering it as written. Wording changes
// require the same clinical review as safety copy — see CONTRIBUTING.md.

import type { InstrumentDefinition } from './types'

export const PHQ9_RECALL_PERIOD = 'Over the last 2 weeks' as const

export const PHQ9_RESPONSE_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' }
] as const

export const PHQ9_ITEMS = [
  { itemCode: 'PHQ9_Q1', prompt: 'Little interest or pleasure in doing things' },
  { itemCode: 'PHQ9_Q2', prompt: 'Feeling down, depressed, or hopeless' },
  {
    itemCode: 'PHQ9_Q3',
    prompt: 'Trouble falling or staying asleep, or sleeping too much'
  },
  { itemCode: 'PHQ9_Q4', prompt: 'Feeling tired or having little energy' },
  { itemCode: 'PHQ9_Q5', prompt: 'Poor appetite or overeating' },
  {
    itemCode: 'PHQ9_Q6',
    prompt:
      'Feeling bad about yourself — or that you are a failure or have let yourself or your family down'
  },
  {
    itemCode: 'PHQ9_Q7',
    prompt: 'Trouble concentrating on things, such as reading the newspaper or watching television'
  },
  {
    itemCode: 'PHQ9_Q8',
    prompt:
      'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual'
  },
  {
    itemCode: 'PHQ9_Q9',
    prompt: 'Thoughts that you would be better off dead, or of hurting yourself in some way'
  }
] as const

// [R2] The item whose response value drives the unconditional CRISIS override in
// server/domain/safety.ts once it lands. Referenced by code, not array position, so that rule
// can never be broken by a reordering of PHQ9_ITEMS.
export const PHQ9_ITEM_NINE_CODE = 'PHQ9_Q9' as const

export const PHQ9_FOLLOW_UP = {
  itemCode: 'PHQ9_FOLLOWUP',
  prompt:
    'If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?',
  responseOptions: [
    { value: 0, label: 'Not difficult at all' },
    { value: 1, label: 'Somewhat difficult' },
    { value: 2, label: 'Very difficult' },
    { value: 3, label: 'Extremely difficult' }
  ]
} as const

export type Phq9ItemCode = (typeof PHQ9_ITEMS)[number]['itemCode']

export const PHQ9: InstrumentDefinition = {
  code: 'PHQ9',
  name: 'Patient Health Questionnaire-9 (PHQ-9)',
  recallPeriod: PHQ9_RECALL_PERIOD,
  instructions: `${PHQ9_RECALL_PERIOD}, how often have you been bothered by any of the following problems?`,
  responseOptions: [...PHQ9_RESPONSE_OPTIONS],
  items: [...PHQ9_ITEMS],
  followUp: {
    itemCode: PHQ9_FOLLOW_UP.itemCode,
    prompt: PHQ9_FOLLOW_UP.prompt,
    responseOptions: [...PHQ9_FOLLOW_UP.responseOptions]
  }
}
