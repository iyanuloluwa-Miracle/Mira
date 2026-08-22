// [FR2][NFR2] Manages one screening session client-side: the ordered item list (fetched once
// from POST /api/screening/start and cached in reactive state, never re-fetched), the current
// question, and answers. Answering is optimistic and local-first — selecting a value updates
// state and localStorage immediately and returns without waiting on the network; the actual
// save happens in the background and is retried on reconnect, so a slow or intermittent
// connection never blocks moving to the next question.

interface ScreeningItem {
  itemCode: string
  prompt: string
}

interface ResponseOption {
  value: 0 | 1 | 2 | 3
  label: string
}

export interface ScreeningResult {
  riskLevel: string
  phq9Total: number
  gad7Total: number
  phq9Band: string
  gad7Band: string
  rationale: string[]
  escalated: boolean
}

interface ScreeningState {
  sessionId: string | null
  items: ScreeningItem[]
  responseOptions: ResponseOption[]
  answers: Record<string, number>
  currentIndex: number
  pendingSync: string[]
  status: 'idle' | 'in-progress' | 'completing' | 'completed'
}

function storageKey(sessionId: string): string {
  return `mira-screening-${sessionId}`
}

function loadPersisted(
  sessionId: string
): { answers: Record<string, number>; currentIndex: number } | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persist(sessionId: string, answers: Record<string, number>, currentIndex: number): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify({ answers, currentIndex }))
  } catch {
    // Storage full or unavailable (private browsing) — answers still live in memory and still
    // sync to the server; only the "survive a hard refresh" benefit is lost.
  }
}

function clearPersisted(sessionId: string): void {
  if (!import.meta.client) return
  try {
    localStorage.removeItem(storageKey(sessionId))
  } catch {
    // Nothing to clean up if storage was never usable in the first place.
  }
}

// Module-level, not per-call: useScreeningSession() is invoked from more than one component,
// and this must only ever be registered once regardless of how many call it.
let onlineListenerRegistered = false

export function useScreeningSession() {
  const state = useState<ScreeningState>('screening-session', () => ({
    sessionId: null,
    items: [],
    responseOptions: [],
    answers: {},
    currentIndex: 0,
    pendingSync: [],
    status: 'idle'
  }))

  const currentItem = computed<ScreeningItem | null>(
    () => state.value.items[state.value.currentIndex] ?? null
  )
  const totalItems = computed(() => state.value.items.length)
  const answeredCount = computed(() => Object.keys(state.value.answers).length)
  const isComplete = computed(() => answeredCount.value >= totalItems.value && totalItems.value > 0)
  const hasPendingSync = computed(() => state.value.pendingSync.length > 0)

  // [FR2] Starts a fresh session. Called once, from the landing page — the screening page
  // itself only ever reads existing state, it never starts a new session on its own.
  async function start(): Promise<string> {
    const { ensureSession } = useAuth()
    await ensureSession()

    const response = await $fetch<{
      sessionId: string
      instruments: {
        phq9: { items: ScreeningItem[]; responseOptions: ResponseOption[] }
        gad7: { items: ScreeningItem[] }
      }
    }>('/api/screening/start', { method: 'POST' })

    state.value = {
      sessionId: response.sessionId,
      items: [...response.instruments.phq9.items, ...response.instruments.gad7.items],
      responseOptions: response.instruments.phq9.responseOptions,
      answers: {},
      currentIndex: 0,
      pendingSync: [],
      status: 'in-progress'
    }

    return response.sessionId
  }

  // Restores from localStorage when landing directly on /screen/[sessionId] (e.g. a refresh
  // mid-screening). The item list itself still has to be re-fetched — it's cheap, cacheable,
  // and it's the one thing we can't reconstruct from localStorage alone — but this does not
  // create a new session or lose any answered-so-far state.
  async function restore(sessionId: string): Promise<boolean> {
    if (state.value.sessionId === sessionId && state.value.items.length > 0) return true

    const persisted = loadPersisted(sessionId)
    if (!persisted) return false

    const [phq9, gad7] = await Promise.all([
      $fetch<{ items: ScreeningItem[]; responseOptions: ResponseOption[] }>(
        '/api/instruments/PHQ9'
      ),
      $fetch<{ items: ScreeningItem[] }>('/api/instruments/GAD7')
    ])

    state.value = {
      sessionId,
      items: [...phq9.items, ...gad7.items],
      responseOptions: phq9.responseOptions,
      answers: persisted.answers,
      currentIndex: persisted.currentIndex,
      pendingSync: Object.keys(persisted.answers),
      status: 'in-progress'
    }
    await flushPending()
    return true
  }

  async function syncAnswer(itemCode: string, rawValue: number): Promise<boolean> {
    if (!state.value.sessionId) return false
    try {
      await $fetch(`/api/screening/${state.value.sessionId}/answer`, {
        method: 'POST',
        body: { itemCode, rawValue }
      })
      state.value.pendingSync = state.value.pendingSync.filter((code) => code !== itemCode)
      return true
    } catch {
      if (!state.value.pendingSync.includes(itemCode)) {
        state.value.pendingSync = [...state.value.pendingSync, itemCode]
      }
      return false
    }
  }

  async function flushPending(): Promise<void> {
    const toRetry = [...state.value.pendingSync]
    for (const itemCode of toRetry) {
      const value = state.value.answers[itemCode]
      if (value !== undefined) await syncAnswer(itemCode, value)
    }
  }

  // [NFR2] Optimistic: local state and localStorage update synchronously, before the network
  // call even starts, so selecting an answer and moving on never waits for a round trip.
  function answerCurrent(rawValue: number): void {
    const item = currentItem.value
    if (!item || !state.value.sessionId) return

    state.value.answers = { ...state.value.answers, [item.itemCode]: rawValue }
    persist(state.value.sessionId, state.value.answers, state.value.currentIndex)

    void syncAnswer(item.itemCode, rawValue)
  }

  function goNext(): void {
    if (state.value.currentIndex < state.value.items.length - 1) {
      state.value.currentIndex += 1
      if (state.value.sessionId)
        persist(state.value.sessionId, state.value.answers, state.value.currentIndex)
    }
  }

  function goBack(): void {
    if (state.value.currentIndex > 0) {
      state.value.currentIndex -= 1
      if (state.value.sessionId)
        persist(state.value.sessionId, state.value.answers, state.value.currentIndex)
    }
  }

  async function complete(): Promise<ScreeningResult> {
    if (!state.value.sessionId) throw new Error('No active screening session.')

    state.value.status = 'completing'
    await flushPending()

    if (state.value.pendingSync.length > 0) {
      state.value.status = 'in-progress'
      throw new Error(
        "Some answers haven't synced yet — check your connection and try again in a moment."
      )
    }

    // Nuxt infers this route's response type automatically from the server handler, which
    // widens rationale to Prisma's generic Json type — cast back to what complete.post.ts
    // actually always writes (its own triage.rationale array) rather than fighting that
    // inference with a generic that gets merged rather than overridden.
    const result = (await $fetch(`/api/screening/${state.value.sessionId}/complete`, {
      method: 'POST'
    })) as unknown as ScreeningResult
    state.value.status = 'completed'
    clearPersisted(state.value.sessionId)
    return result
  }

  if (import.meta.client && !onlineListenerRegistered) {
    onlineListenerRegistered = true
    window.addEventListener('online', () => {
      void flushPending()
    })
  }

  return {
    state: readonly(state),
    currentItem,
    totalItems,
    answeredCount,
    isComplete,
    hasPendingSync,
    start,
    restore,
    answerCurrent,
    goNext,
    goBack,
    complete
  }
}
