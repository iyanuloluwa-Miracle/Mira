// [R8] Global error handler, registered via nitro.errorHandler in nuxt.config.ts — replaces
// Nitro's own default entirely, for every route (API and page). Every deliberate error this app
// throws (server/utils/errors.ts's badRequestError/unauthorizedError/etc.) carries a 4xx status
// and a statusMessage written to be read by the person using the app; those pass through
// unchanged. Anything else — a genuine bug, a raw Prisma error that escaped a route without
// going through server/utils/errors.ts, a database constraint violation — always becomes the
// same flat 500 with a generic message, regardless of what the underlying error actually says,
// so a stack trace or a constraint name can never reach the client by accident. The real error
// is still captured, server-side, through logger.ts's redactor (rule R4) — never a raw
// console.error, and never under the key `message` (server/utils/privacy.ts's redaction denylist
// includes that key, since it's the one live chat content most often arrives under, which would
// otherwise silently swallow the one thing this log line exists to capture).
//
// This file sits outside server/api|middleware|plugins|utils, the directories Nitro auto-scans
// for imports, so every helper it needs is imported explicitly rather than relying on that.

import { send, setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { logger } from './utils/logger'

const GENERIC_SERVER_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.'

interface NitroHandledError {
  statusCode?: number
  statusMessage?: string
  message?: string
  stack?: string
}

export default function errorHandler(
  error: NitroHandledError,
  event: H3Event
): void | Promise<void> {
  const isKnownClientError =
    typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500

  const statusCode = isKnownClientError ? error.statusCode! : 500
  const statusMessage = isKnownClientError
    ? (error.statusMessage ?? 'Request failed')
    : GENERIC_SERVER_ERROR_MESSAGE

  if (!isKnownClientError) {
    logger.error('unhandled server error', {
      errorMessage: error.message,
      errorStack: error.stack,
      path: event.path,
      method: event.method
    })
  }

  setResponseStatus(event, statusCode, statusMessage)
  setResponseHeader(event, 'content-type', 'application/json')
  return send(event, JSON.stringify({ statusCode, statusMessage }))
}
