<script setup lang="ts">
// [FR4] Past screening sessions for whoever holds the current session — anonymous or
// registered, matching GET /api/screening/history's own scope (rule R9: never gated on
// registration). No standalone auth middleware: ensureSession() below creates one if none
// exists yet, the same "honest empty state, not an error" posture privacy/my-data.vue uses.
interface HistoryItem {
  sessionId: string
  status: string
  startedAt: string
  completedAt: string | null
  phq9Total: number | null
  gad7Total: number | null
  phq9Band: string | null
  gad7Band: string | null
  riskLevel: string | null
}

const { ensureSession } = useAuth()

const loading = ref(true)
const loadError = ref<string | null>(null)
const sessions = ref<HistoryItem[]>([])

onMounted(async () => {
  try {
    await ensureSession()
    const response = await $fetch<{ sessions: HistoryItem[] }>('/api/screening/history')
    sessions.value = response.sessions
  } catch {
    loadError.value = "We couldn't load your history."
  } finally {
    loading.value = false
  }
})

useHead({ title: 'Your check-ins' })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">Your check-ins</h1>
    <p class="mt-2 text-sm text-slate-600">
      Every screening tied to this account, most recent first.
    </p>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>
    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>
    <div v-else-if="sessions.length === 0" class="mt-10 text-center">
      <p class="text-base text-slate-600">No check-ins yet.</p>
    </div>

    <ul v-else class="mt-6 flex flex-col gap-2">
      <li v-for="session in sessions" :key="session.sessionId">
        <NuxtLink
          v-if="session.status === 'COMPLETED'"
          :to="`/result/${session.sessionId}`"
          class="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
        >
          <span class="flex items-center gap-3">
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="
                session.riskLevel === 'CRISIS' || session.riskLevel === 'HIGH'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-slate-100 text-slate-700'
              "
            >
              {{ session.riskLevel }}
            </span>
          </span>
          <span class="text-xs text-slate-500">
            {{ new Date(session.completedAt ?? session.startedAt).toLocaleDateString() }}
          </span>
        </NuxtLink>
        <div
          v-else
          class="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-slate-500"
        >
          <span class="text-sm">Not completed</span>
          <span class="text-xs">{{ new Date(session.startedAt).toLocaleDateString() }}</span>
        </div>
      </li>
    </ul>

    <NuxtLink to="/" class="mt-8 block text-center text-sm text-indigo-700 underline"
      >Back</NuxtLink
    >
  </main>
</template>
