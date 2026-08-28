// [R8] Unit coverage for the global error handler (nuxt.config.ts's nitro.errorHandler). h3's
// send/setResponseHeader/setResponseStatus are mocked so this can assert exactly what reaches
// the client and exactly what reaches the log, without a running server.

import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

const send = vi.fn()
const setResponseHeader = vi.fn()
const setResponseStatus = vi.fn()
vi.mock('h3', () => ({ send, setResponseHeader, setResponseStatus }))

const errorLog = vi.fn()
vi.mock('./utils/logger', () => ({ logger: { error: errorLog } }))

const { default: errorHandler } = await import('./error')

function fakeEvent(): H3Event {
  return { path: '/api/screening/start', method: 'POST' } as unknown as H3Event
}

describe('errorHandler', () => {
  it('passes a deliberate 4xx error straight through, unmodified', async () => {
    const event = fakeEvent()
    await errorHandler({ statusCode: 400, statusMessage: 'A valid session id is required.' }, event)

    expect(setResponseStatus).toHaveBeenCalledWith(event, 400, 'A valid session id is required.')
    expect(errorLog).not.toHaveBeenCalled()
    const [, body] = send.mock.calls.at(-1)!
    expect(JSON.parse(body)).toEqual({
      statusCode: 400,
      statusMessage: 'A valid session id is required.'
    })
  })

  it('flattens any error with no status code (or a 5xx one) to a generic 500', async () => {
    const event = fakeEvent()
    const dbError = new Error(
      'Unique constraint failed on the fields: (`emailHash`) at column "users_emailHash_key"'
    )
    dbError.stack = 'Error: leaked\n    at somewhere (/app/server/utils/db.ts:12:3)'
    await errorHandler(dbError, event)

    expect(setResponseStatus).toHaveBeenCalledWith(
      event,
      500,
      'An unexpected error occurred. Please try again.'
    )
    const [, body] = send.mock.calls.at(-1)!
    const parsed = JSON.parse(body)
    expect(parsed.statusCode).toBe(500)
    expect(parsed.statusMessage).toBe('An unexpected error occurred. Please try again.')
    // Neither the Prisma constraint detail nor the stack trace reach the response body.
    expect(body).not.toContain('emailHash')
    expect(body).not.toContain('somewhere')
  })

  it('logs the real error server-side, under a key the redactor will not blank out', async () => {
    const event = fakeEvent()
    const dbError = new Error('constraint detail that must be logged, not lost')
    await errorHandler(dbError, event)

    expect(errorLog).toHaveBeenCalledWith(
      'unhandled server error',
      expect.objectContaining({
        errorMessage: 'constraint detail that must be logged, not lost',
        path: '/api/screening/start',
        method: 'POST'
      })
    )
  })

  it('treats an explicit 500 the same as a missing status code', async () => {
    const event = fakeEvent()
    await errorHandler({ statusCode: 500, statusMessage: 'Internal', message: 'boom' }, event)

    expect(setResponseStatus).toHaveBeenCalledWith(
      event,
      500,
      'An unexpected error occurred. Please try again.'
    )
    expect(errorLog).toHaveBeenCalled()
  })
})
