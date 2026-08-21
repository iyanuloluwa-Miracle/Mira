// [R8] Typed, deliberately vague-on-the-wire errors for server routes. Every one of these
// throws an H3Error via createError with a statusMessage we wrote ourselves — never a raw
// caught exception, Prisma error, or stack trace. Route handlers should throw one of these
// instead of letting an unexpected error escape and instead of building createError() calls
// inline, so the wording and status codes stay consistent across routes.

export function badRequestError(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export function unauthorizedError(message = 'Invalid credentials'): never {
  throw createError({ statusCode: 401, statusMessage: message })
}

export function forbiddenError(message = 'Not allowed'): never {
  throw createError({ statusCode: 403, statusMessage: message })
}

export function conflictError(message: string): never {
  throw createError({ statusCode: 409, statusMessage: message })
}

export function tooManyRequestsError(message = 'Too many requests, please try again later'): never {
  throw createError({ statusCode: 429, statusMessage: message })
}
