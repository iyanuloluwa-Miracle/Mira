<script setup lang="ts">
// [FR2][NFR2] One question per screen. Answering is optimistic (see useScreeningSession) —
// "Next" never waits on a network round trip, only on whether the current question has an
// answer at all. Sequencing itself is what makes "no way to submit an incomplete instrument"
// true: Next stays disabled until the current item is answered, and Finish only ever appears
// on the last item, by which point every prior one is already answered — reinforced
// server-side too (server/domain/scoring.ts rejects an incomplete submission outright).
//
// Every outcome, CRISIS included, lands on pages/result/[sessionId].vue — that page decides
// whether to show the score breakdown or interrupt with CrisisScreen (rule R2/R3), not this
// one. complete() already stashes the result in shared state, so that navigation costs no
// extra fetch.
const route = useRoute()
const sessionId = route.params.sessionId as string

const { state, currentItem, totalItems, answerCurrent, goNext, goBack, restore, complete } =
  useScreeningSession()

const ready = ref(false)
const loadError = ref<string | null>(null)
const completing = ref(false)
const completeError = ref<string | null>(null)

onMounted(async () => {
  if (state.value.sessionId !== sessionId) {
    const restored = await restore(sessionId)
    if (!restored) {
      loadError.value = "We couldn't find that screening session on this device."
      return
    }
  }
  ready.value = true
})

const currentValue = computed(() => {
  const item = currentItem.value
  if (!item) return null
  return state.value.answers[item.itemCode] ?? null
})

const currentPosition = computed(() => state.value.currentIndex + 1)
const isLastItem = computed(() => state.value.currentIndex === totalItems.value - 1)
const canAdvance = computed(() => currentValue.value !== null)

function handleAnswer(value: number) {
  answerCurrent(value)
}

async function handleNext() {
  if (!canAdvance.value) return

  if (!isLastItem.value) {
    goNext()
    return
  }

  completing.value = true
  completeError.value = null
  try {
    await complete()
    await navigateTo(`/result/${sessionId}`)
  } catch (error) {
    completeError.value = error instanceof Error ? error.message : 'Something went wrong.'
    completing.value = false
  }
}
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8 pb-28">
    <SafetyExitButton />

    <div v-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
      <NuxtLink to="/" class="mt-4 inline-block text-indigo-700 underline">Start over</NuxtLink>
    </div>

    <div v-else-if="!ready" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading your screening…</p>
    </div>

    <div v-else-if="completing" class="mt-10 text-center">
      <p class="text-base text-slate-600">Finishing up…</p>
    </div>

    <div v-else-if="currentItem" class="mt-6 flex flex-col gap-6">
      <ScreeningProgressBar :current="currentPosition" :total="totalItems" />

      <ScreeningQuestionCard
        :item-code="currentItem.itemCode"
        :prompt="currentItem.prompt"
        :options="state.responseOptions"
        :model-value="currentValue"
        @update:model-value="handleAnswer"
      />

      <p v-if="completeError" role="alert" class="text-sm text-red-700">{{ completeError }}</p>

      <div class="flex gap-3">
        <button
          type="button"
          class="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base font-semibold text-slate-900 disabled:opacity-40"
          :disabled="state.currentIndex === 0"
          @click="goBack"
        >
          Back
        </button>
        <button
          type="button"
          class="min-h-[44px] flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          :disabled="!canAdvance || completing"
          @click="handleNext"
        >
          {{ completing ? 'Finishing…' : isLastItem ? 'Finish' : 'Next' }}
        </button>
      </div>
    </div>
  </main>
</template>
