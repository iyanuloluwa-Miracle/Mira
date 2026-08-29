// [Chapter Four, Section 3.8.3] Runs on every client-side navigation, but only ever sends
// anything when a researcher has actually started an evaluation session (useEvaluation's
// logEvent is itself a no-op otherwise) — no cost, no data, for ordinary use. A browser
// back/forward button press is distinguished from a forward navigation via Vue Router's own
// `history.state.back` bookkeeping rather than a popstate listener, which is simpler and
// already reliably available on every NavigationGuard call.

export default defineNuxtRouteMiddleware((to, from) => {
  if (!import.meta.client) return
  if (!from || to.fullPath === from.fullPath) return

  const { logEvent } = useEvaluation()
  const isBackNavigation = window.history.state?.back === to.fullPath

  void logEvent({
    type: isBackNavigation ? 'BACK_NAVIGATION' : 'SCREEN_TRANSITION',
    screen: to.path
  })
})
