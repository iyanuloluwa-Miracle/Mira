<script setup lang="ts">
// [FR2][FR3][NFR2] One question per screen, then an optional free-text step, then completion.
// Answering is optimistic (see useScreeningSession) — "Next" never waits on a network round
// trip, only on whether the current question has an answer at all. Next stays disabled until
// the current item is answered, and "Finish" only ever appears on the last item, by which point
// every prior one is already answered — reinforced server-side too (server/domain/scoring.ts
// rejects an incomplete submission outright).
//
// "Finish" on the last item doesn't complete the session directly — it reveals the free-text
// step (showFreeTextStep), which is itself the thing that either submits or explicitly skips
// free text before calling complete(). This is what makes the step genuinely optional without
// silently skipping it: the person always makes one of the two choices.
//
// Every outcome, CRISIS included, lands on pages/result/[sessionId].vue — that page decides
// whether to show the score breakdown or interrupt with CrisisScreen (rule R2/R3), not this
// one. complete() already stashes the result in shared state, so that navigation costs no
// extra fetch.
import { FREE_TEXT_MAX_LENGTH } from '~~/shared/freeText'
import {
  FREE_TEXT_CHARACTER_GUIDE,
  FREE_TEXT_CONTINUE_LABEL,
  FREE_TEXT_EXPLANATION,
  FREE_TEXT_HEADING,
  FREE_TEXT_OPTIONAL_LABEL,
  FREE_TEXT_PLACEHOLDER,
  FREE_TEXT_SKIP_LABEL,
  FREE_TEXT_SUBMIT_ERROR
} from '~/content/copy/postScreening'

const route = useRoute()
const sessionId = route.params.sessionId as string

const {
  state,
  currentItem,
  totalItems,
  answerCurrent,
  goNext,
  goBack,
  restore,
  submitFreeText,
  skipFreeText,
  complete
} = useScreeningSession()

const { logError } = useEvaluation()

const ready = ref(false)
const loadError = ref<string | null>(null)
const completing = ref(false)
const completeError = ref<string | null>(null)

// [Chapter Four, Section 3.8.3] Moving between questions never triggers a route change (it's
// all one page, tracked in-memory) — the global evaluation-tracking middleware only sees route
// changes, so a real in-app back-navigation signal (someone reconsidering an earlier answer)
// needs its own explicit call here.
function handleBack() {
  goBack()
  useEvaluation().logEvent({ type: 'BACK_NAVIGATION', screen: route.path })
}

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

const showFreeTextStep = ref(false)
const freeTextInput = ref('')
const freeTextError = ref<string | null>(null)
const freeTextRemaining = computed(() => FREE_TEXT_MAX_LENGTH - freeTextInput.value.length)
const canSubmitFreeText = computed(
  () => freeTextInput.value.trim().length > 0 && freeTextRemaining.value >= 0
)

function handleNext() {
  if (!canAdvance.value) return

  if (!isLastItem.value) {
    goNext()
    return
  }

  showFreeTextStep.value = true
}

async function finishScreening() {
  completing.value = true
  completeError.value = null
  try {
    await complete()
    await navigateTo(`/result/${sessionId}`)
  } catch (error) {
    completeError.value = error instanceof Error ? error.message : 'Something went wrong.'
    completing.value = false
    logError()
  }
}

async function handleSubmitFreeText() {
  if (!canSubmitFreeText.value) return
  freeTextError.value = null
  try {
    await submitFreeText(freeTextInput.value.trim())
  } catch {
    freeTextError.value = FREE_TEXT_SUBMIT_ERROR
    logError()
    return
  }
  await finishScreening()
}

async function handleSkipFreeText() {
  freeTextError.value = null
  try {
    await skipFreeText()
  } catch {
    freeTextError.value = FREE_TEXT_SUBMIT_ERROR
    logError()
    return
  }
  await finishScreening()
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

    <div v-else-if="showFreeTextStep" class="mt-6 flex flex-col gap-6">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-semibold text-slate-900">{{ FREE_TEXT_HEADING }}</h1>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {{ FREE_TEXT_OPTIONAL_LABEL }}
          </span>
        </div>
        <p class="mt-2 text-sm text-slate-600">{{ FREE_TEXT_EXPLANATION }}</p>
      </div>

      <div>
        <textarea
          v-model="freeTextInput"
          :maxlength="FREE_TEXT_MAX_LENGTH"
          :placeholder="FREE_TEXT_PLACEHOLDER"
          rows="6"
          class="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
        />
        <p class="mt-1 text-right text-xs text-slate-500">
          {{ FREE_TEXT_CHARACTER_GUIDE(freeTextRemaining) }}
        </p>
      </div>

      <p v-if="freeTextError" role="alert" class="text-sm text-red-700">{{ freeTextError }}</p>

      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          :disabled="!canSubmitFreeText"
          @click="handleSubmitFreeText"
        >
          {{ FREE_TEXT_CONTINUE_LABEL }}
        </button>
        <div class="flex gap-3">
          <button
            type="button"
            class="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base font-semibold text-slate-900"
            @click="showFreeTextStep = false"
          >
            Back
          </button>
          <button
            type="button"
            class="min-h-[44px] flex-1 rounded-lg px-4 py-3 text-base font-semibold text-slate-600 underline"
            @click="handleSkipFreeText"
          >
            {{ FREE_TEXT_SKIP_LABEL }}
          </button>
        </div>
      </div>
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
          @click="handleBack"
        >
          Back
        </button>
        <button
          type="button"
          class="min-h-[44px] flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          :disabled="!canAdvance"
          @click="handleNext"
        >
          {{ isLastItem ? 'Finish' : 'Next' }}
        </button>
      </div>
    </div>
  </main>
</template>
