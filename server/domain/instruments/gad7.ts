// [FR2] Validated GAD-7 (Generalized Anxiety Disorder-7) item wording and response options, as
// plain data — the item text below is reproduced exactly as validated and must not be
// paraphrased; construct validity depends on administering it as written. Wording changes
// require the same clinical review as safety copy — see CONTRIBUTING.md.

import type { InstrumentDefinition } from './types'

export const GAD7_RECALL_PERIOD = 'Over the last 2 weeks' as const

export const GAD7_RESPONSE_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' }
] as const

export const GAD7_ITEMS = [
  { itemCode: 'GAD7_Q1', prompt: 'Feeling nervous, anxious, or on edge' },
  { itemCode: 'GAD7_Q2', prompt: 'Not being able to stop or control worrying' },
  { itemCode: 'GAD7_Q3', prompt: 'Worrying too much about different things' },
  { itemCode: 'GAD7_Q4', prompt: 'Trouble relaxing' },
  { itemCode: 'GAD7_Q5', prompt: 'Being so restless that it is hard to sit still' },
  { itemCode: 'GAD7_Q6', prompt: 'Becoming easily annoyed or irritable' },
  { itemCode: 'GAD7_Q7', prompt: 'Feeling afraid, as if something awful might happen' }
] as const

export type Gad7ItemCode = (typeof GAD7_ITEMS)[number]['itemCode']

export const GAD7: InstrumentDefinition = {
  code: 'GAD7',
  name: 'Generalized Anxiety Disorder-7 (GAD-7)',
  recallPeriod: GAD7_RECALL_PERIOD,
  instructions: `${GAD7_RECALL_PERIOD}, how often have you been bothered by the following problems?`,
  responseOptions: [...GAD7_RESPONSE_OPTIONS],
  items: [...GAD7_ITEMS]
}
