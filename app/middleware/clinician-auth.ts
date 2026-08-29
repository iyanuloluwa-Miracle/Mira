// [FR7] Client-side navigation guard for /clinician/* pages — mirrors but never replaces the
// real enforcement, which is server-side (server/utils/clinician-auth.ts's requireClinician on
// every clinician API route). This only exists so an unauthenticated visit redirects to the
// login page instead of rendering a page that immediately fails every fetch it makes.

export default defineNuxtRouteMiddleware(async () => {
  const { session, refresh } = useClinicianAuth()

  if (!session.value.authenticated) {
    try {
      await refresh()
    } catch {
      // Treated as unauthenticated below.
    }
  }

  if (!session.value.authenticated) {
    return navigateTo('/clinician/login')
  }
})
