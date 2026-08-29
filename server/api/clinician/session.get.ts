// [FR7] Reports whether the current request carries a valid clinician session — the parallel
// to server/api/auth/session.get.ts. Never requires one; this is how the clinician dashboard's
// client-side middleware checks auth state.

export default defineEventHandler((event) => {
  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const clinician = event.context.clinician

  if (!clinician) {
    return { authenticated: false as const }
  }

  return {
    authenticated: true as const,
    fullName: clinician.fullName,
    role: clinician.role
  }
})
