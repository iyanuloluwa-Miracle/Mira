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
  <main class="screen-page">
    <SafetyExitButton />

    <div class="screen-page__inner">
      <div v-if="loadError" class="text-center">
        <p class="text-base text-slate-900">{{ loadError }}</p>
        <NuxtLink to="/" class="mt-4 inline-block text-teal-800 underline">Start over</NuxtLink>
      </div>

      <div v-else-if="!ready" class="text-center">
        <p class="text-base text-slate-600">Loading your screening…</p>
      </div>

      <div v-else-if="completing" class="text-center">
        <p class="text-base text-slate-600">Finishing up…</p>
      </div>

      <div v-else-if="showFreeTextStep" class="flex flex-col gap-6">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-semibold text-slate-900">{{ FREE_TEXT_HEADING }}</h1>
            <span class="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
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
            class="w-full rounded-lg border border-slate-300 bg-white/80 px-4 py-3 text-base"
          />
          <p class="mt-1 text-right text-xs text-slate-500">
            {{ FREE_TEXT_CHARACTER_GUIDE(freeTextRemaining) }}
          </p>
        </div>

        <p v-if="freeTextError" role="alert" class="text-sm text-red-700">{{ freeTextError }}</p>

        <div class="flex flex-col gap-3">
          <button
            type="button"
            class="min-h-[44px] rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
            :disabled="!canSubmitFreeText"
            @click="handleSubmitFreeText"
          >
            {{ FREE_TEXT_CONTINUE_LABEL }}
          </button>
          <div class="flex gap-3">
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white/70 px-4 py-3 text-base font-semibold text-slate-900"
              @click="showFreeTextStep = false"
            >
              Back
            </button>
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg px-4 py-3 text-base font-semibold text-slate-700 underline"
              @click="handleSkipFreeText"
            >
              {{ FREE_TEXT_SKIP_LABEL }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="currentItem" class="flex flex-col gap-6">
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
            class="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white/70 px-4 py-3 text-base font-semibold text-slate-900 disabled:opacity-40"
            :disabled="state.currentIndex === 0"
            @click="handleBack"
          >
            Back
          </button>
          <button
            type="button"
            class="min-h-[44px] flex-1 rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
            :disabled="!canAdvance"
            @click="handleNext"
          >
            {{ isLastItem ? 'Finish' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.screen-page {
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  overflow: hidden;
  background:
    radial-gradient(90% 60% at 85% 0%, rgba(158, 201, 196, 0.45) 0%, transparent 55%),
    radial-gradient(70% 50% at 10% 80%, rgba(120, 168, 180, 0.28) 0%, transparent 50%),
    linear-gradient(168deg, #eef5f3 0%, #d8e8e4 55%, #c5d9d4 100%);
}

.screen-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.22;
  pointer-events: none;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
}

.screen-page__inner {
  position: relative;
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 7rem;
}
</style>
