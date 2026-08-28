// [R8] Shared zod fragments reused across server/api routes so "what counts as a valid session
// id" or "this route accepts no query/body at all" is defined once. Route handlers still call
// schema.safeParse(...) and badRequestError(...) inline themselves, matching this codebase's
// existing convention (server/api/auth/login.post.ts and others) rather than wrapping that in a
// generic parse-or-throw helper.

import { z } from 'zod'

export const uuidParamSchema = z.string().uuid()

export const slugParamSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

// A route that legitimately takes no query string or no request body still validates that
// nothing unexpected was sent — .strict() rejects any key at all, matching the "reject unknown
// keys rather than stripping them silently" requirement even for a route with nothing to accept.
export const emptyQuerySchema = z.object({}).strict()
export const emptyBodySchema = z.object({}).strict()
