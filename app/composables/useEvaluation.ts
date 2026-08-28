// [Chapter Four, Section 3.8.3] Client-side half of usability-test event logging. Holds the
// active EvaluationSession id in both a shared useState (so every component sees the same
// value within one tab) and localStorage (so it survives a full page reload — the same
// persistence choice useScreeningSession.ts makes for answers, for the same reason). There is
// no cross-device link: this app's moderated-testing setup is one researcher and one participant
// sharing the same browser, so the researcher's own "start" click on /admin/evaluation is what
// makes every subsequent page in that same tab start logging.

const STORAGE_KEY = 'mira-evaluation-session'

export type EvaluationEventType =
  | 'TASK_START'
  | 'TASK_END'
  | 'SCREEN_TRANSITION'
  | 'BACK_NAVIGATION'
  | 'ERROR_ENCOUNTERED'
  | 'ABANDONMENT'

interface LogEventInput {
  type: EvaluationEventType
  taskId?: string
  screen?: string
  completed?: boolean
}

export function useEvaluation() {
  const evaluationSessionId = useState<string | null>('evaluation-session-id', () => {
    if (!import.meta.client) return null
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  function start(id: string): void {
    evaluationSessionId.value = id
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Session still tracked in memory for the rest of this tab's lifetime; only "survives a
      // reload" is lost if storage is unavailable (private browsing).
    }
  }

  function stop(): void {
    evaluationSessionId.value = null
    if (!import.meta.client) return
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage was never usable.
    }
  }

  // Best-effort and silent — a lost usability-test event must never surface as a visible error
  // to the participant, who is very often not the researcher watching for it.
  async function logEvent(input: LogEventInput): Promise<void> {
    const id = evaluationSessionId.value
    if (!id) return
    try {
      await $fetch('/api/evaluation/event', {
        method: 'POST',
        body: { evaluationSessionId: id, ...input }
      })
    } catch {
      // Dropped observation, not a failed interaction — see comment above.
    }
  }

  // [Chapter Four, Section 3.8.3] "Error encountered" specifically means the participant saw an
  // error message — every call site below is inside a catch block that already sets a
  // user-visible error.value, so this is only ever called when that's true. screen defaults to
  // the current route so call sites don't have to pass it themselves.
  function logError(screen?: string): void {
    void logEvent({ type: 'ERROR_ENCOUNTERED', screen: screen ?? useRoute().path })
  }

  return {
    evaluationSessionId: readonly(evaluationSessionId),
    isActive: computed(() => evaluationSessionId.value !== null),
    start,
    stop,
    logEvent,
    logError
  }
}
