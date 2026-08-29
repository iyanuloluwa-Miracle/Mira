<script setup lang="ts">
// [Chapter Four, Section 3.8.3] Researcher-facing start/stop control for a moderated
// usability-test sitting. ADMIN-gated the same way app/pages/admin/metrics.vue and
// app/pages/clinician/resources/index.vue are — see clinician-auth's own comment on why this
// only checks *a* session exists and every fetch below still gets a 403 from the server for a
// plain (non-admin) clinician account.
definePageMeta({ middleware: 'clinician-auth' })

const { evaluationSessionId, isActive, start, stop } = useEvaluation()

const participantCode = ref('')
const consented = ref(false)
const starting = ref(false)
const startError = ref<string | null>(null)
const ending = ref(false)

async function handleStart(): Promise<void> {
  starting.value = true
  startError.value = null
  try {
    const response = await $fetch<{ id: string }>('/api/admin/evaluation/start', {
      method: 'POST',
      body: { participantCode: participantCode.value.trim(), consented: true }
    })
    start(response.id)
  } catch (err) {
    const fetchError = err as { data?: { statusMessage?: string } }
    startError.value = fetchError.data?.statusMessage ?? 'Could not start the evaluation session.'
  } finally {
    starting.value = false
  }
}

async function handleEnd(): Promise<void> {
  if (!evaluationSessionId.value) return
  ending.value = true
  try {
    await $fetch(`/api/admin/evaluation/${evaluationSessionId.value}/end`, { method: 'POST' })
  } catch {
    // Best-effort — the session still stops being tracked client-side either way; a researcher
    // can always end an orphaned session later by re-running this against its id.
  } finally {
    stop()
    ending.value = false
  }
}
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">Evaluation session</h1>
    <p class="mt-2 text-sm text-slate-600">
      Starts a usability-test sitting on this browser. Once active, use the floating control in the
      bottom-left corner to mark task boundaries, then
      <NuxtLink to="/" class="text-indigo-700 underline">begin the test</NuxtLink>
      from the home page.
    </p>

    <div v-if="isActive" class="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
      <p class="text-sm font-semibold text-emerald-900">Evaluation session active</p>
      <p class="mt-1 break-all text-xs text-emerald-800">{{ evaluationSessionId }}</p>
      <button
        type="button"
        class="mt-3 min-h-[44px] w-full rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        :disabled="ending"
        @click="handleEnd"
      >
        {{ ending ? 'Ending…' : 'End session' }}
      </button>
    </div>

    <form v-else class="mt-6 flex flex-col gap-4" @submit.prevent="handleStart">
      <div>
        <label for="participant-code" class="mb-1 block text-sm font-medium text-slate-900">
          Participant code
        </label>
        <input
          id="participant-code"
          v-model="participantCode"
          type="text"
          required
          class="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 py-2 text-base"
        />
      </div>

      <label class="flex items-start gap-2 text-sm text-slate-900">
        <input v-model="consented" type="checkbox" required class="mt-1 h-4 w-4" />
        <span>The participant has given informed consent for this session.</span>
      </label>

      <p v-if="startError" role="alert" class="text-sm text-red-700">{{ startError }}</p>

      <button
        type="submit"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        :disabled="starting || !consented || !participantCode.trim()"
      >
        {{ starting ? 'Starting…' : 'Start session' }}
      </button>
    </form>

    <NuxtLink to="/admin/metrics" class="mt-6 block text-center text-sm text-indigo-700 underline">
      View metrics
    </NuxtLink>
  </main>
</template>
