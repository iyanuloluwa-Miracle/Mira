<script setup lang="ts">
// [FR1][R9] "Start a private check" needs no email or password — useScreeningSession().start()
// calls useAuth().ensureSession() first, which transparently creates an anonymous identity if
// the visitor doesn't have one yet. Registration is never on the path to screening.
const { start } = useScreeningSession()
const starting = ref(false)
const error = ref<string | null>(null)

async function handleStart() {
  starting.value = true
  error.value = null
  try {
    const sessionId = await start()
    await navigateTo(`/screen/${sessionId}`)
  } catch {
    error.value = "We couldn't start a session. Please try again."
    starting.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6 py-10">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900">Mira</h1>
      <p class="mt-4 text-base text-slate-700">
        A private, few-minute check-in on how you've been feeling lately.
      </p>
    </div>

    <div
      class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="note"
    >
      <p class="font-medium">This is not a diagnosis.</p>
      <p class="mt-1">
        Mira is a screening tool, not a substitute for professional care. Only a qualified clinician
        can diagnose a mental health condition.
      </p>
    </div>

    <div class="flex flex-col gap-3">
      <button
        type="button"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        :disabled="starting"
        @click="handleStart"
      >
        {{ starting ? 'Starting…' : 'Start a private check' }}
      </button>
      <p class="text-center text-xs text-slate-500">No account needed — you can register later.</p>

      <NuxtLink
        to="/login"
        class="flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50"
      >
        Sign in
      </NuxtLink>
    </div>

    <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
  </main>
</template>
