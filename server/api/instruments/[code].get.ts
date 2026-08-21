// [FR2] Serves validated instrument item text and response options so the client fetches
// wording rather than hardcoding it — server/domain/instruments/ stays the single source of
// truth for what a person is actually asked.

import { GAD7 } from '../../domain/instruments/gad7'
import { PHQ9 } from '../../domain/instruments/phq9'

const INSTRUMENTS = { PHQ9, GAD7 } as const

export default defineEventHandler((event) => {
  const code = getRouterParam(event, 'code')?.toUpperCase()

  if (!code || !(code in INSTRUMENTS)) {
    notFoundError('Unknown instrument code. Expected PHQ9 or GAD7.')
  }

  return INSTRUMENTS[code as keyof typeof INSTRUMENTS]
})
