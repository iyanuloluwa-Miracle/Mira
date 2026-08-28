// [FR2] Serves validated instrument item text and response options so the client fetches
// wording rather than hardcoding it — server/domain/instruments/ stays the single source of
// truth for what a person is actually asked.

import { z } from 'zod'
import { GAD7 } from '../../domain/instruments/gad7'
import { PHQ9 } from '../../domain/instruments/phq9'

const INSTRUMENTS = { PHQ9, GAD7 } as const

const codeParamSchema = z
  .string()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(['PHQ9', 'GAD7']))

export default defineEventHandler((event) => {
  const parsedParam = codeParamSchema.safeParse(getRouterParam(event, 'code'))
  if (!parsedParam.success) notFoundError('Unknown instrument code. Expected PHQ9 or GAD7.')

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  return INSTRUMENTS[parsedParam.data]
})
