<script setup lang="ts">
// [FR4][FR6][NFR5][R3] The post-screening result. A CRISIS result interrupts this page with
// CrisisScreen instead of showing scores below it (rule R2/R3) — see showCrisis below. Every
// other risk level shows, in order: the band in plain language, the numeric scores and their
// possible range, the rationale computeTriage produced, what this result is not, a next-steps
// placeholder (resource matching is prompt 15's), and a control to delete this session's data.
//
// Zero network dependency beyond the initial page load: complete() (useScreeningSession) already
// stashes the just-finished result in shared state, so the golden path — finishing a screening
// and landing here — renders with no fetch at all. Arriving by direct URL or a refresh falls
// back to one fetch of GET /api/screening/[id]/result; after that resolves, everything else
// (crisis copy, helplines) is a static import, so there is nothing left to wait on.
import type { ScreeningResult } from '~/composables/useScreeningSession'
import {
  DELETE_SESSION_BUTTON_LABEL,
  DELETE_SESSION_CANCEL_BUTTON_LABEL,
  DELETE_SESSION_CONFIRM_BUTTON_LABEL,
  DELETE_SESSION_CONFIRM_PROMPT,
  DELETE_SESSION_ERROR_MESSAGE,
  DELETE_SESSION_SUCCESS_MESSAGE,
  GAD7_BAND_PHRASES,
  GAD7_SCORE_LABEL,
  GAD7_SCORE_RANGE_LABEL,
  NEXT_STEPS_EMPTY_FALLBACK,
  NEXT_STEPS_HEADING,
  NEXT_STEPS_INTRO,
  NOT_A_DIAGNOSIS_CLOSING,
  NOT_A_DIAGNOSIS_HEADING,
  NOT_A_DIAGNOSIS_POINTS,
  PHQ9_BAND_PHRASES,
  PHQ9_SCORE_LABEL,
  PHQ9_SCORE_RANGE_LABEL,
  RATIONALE_HEADING,
  RATIONALE_INTRO,
  RESULT_BAND_INTRO_PREFIX,
  TEXT_ANALYSIS_EXPLANATION,
  TEXT_ANALYSIS_HEADING,
  TEXT_ANALYSIS_TEXT_FREE_MESSAGE,
  TEXT_ANALYSIS_UNAVAILABLE_MESSAGE
} from '~/content/copy/postScreening'

const route = useRoute()
const sessionId = route.params.sessionId as string

const { state, discard } = useScreeningSession()
const { logError } = useEvaluation()

// state is wrapped in readonly() by the composable — cast away its readonly array/property
// wrapper here, not the value itself, which is a plain ScreeningResult at runtime.
const result = ref<ScreeningResult | null>(
  state.value.sessionId === sessionId ? (state.value.result as ScreeningResult | null) : null
)
const loading = ref(!result.value)
const loadError = ref<string | null>(null)

onMounted(async () => {
  if (result.value) return
  try {
    result.value = (await $fetch(
      `/api/screening/${sessionId}/result`
    )) as unknown as ScreeningResult
  } catch {
    loadError.value = "We couldn't find that screening result."
    logError()
  } finally {
    loading.value = false
  }
})

const showCrisis = computed(() => result.value?.riskLevel === 'CRISIS')
// [FR6] CRISIS keeps its own unconditional interrupt above — this is only for the other
// escalate-worthy band (HIGH), which still shows the normal result content plus this section.
const showReferral = computed(() => !!result.value?.escalated && !showCrisis.value)

const bandIntro = computed(() => {
  if (!result.value) return ''
  const phq9Phrase = PHQ9_BAND_PHRASES[result.value.phq9Band] ?? 'symptoms of depression'
  const gad7Phrase = GAD7_BAND_PHRASES[result.value.gad7Band] ?? 'symptoms of anxiety'
  return `${RESULT_BAND_INTRO_PREFIX} ${phq9Phrase} and ${gad7Phrase}.`
})

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleted = ref(false)

async function handleDelete() {
  deleting.value = true
  deleteError.value = null
  try {
    await $fetch(`/api/screening/${sessionId}`, { method: 'DELETE' })
    discard(sessionId)
    deleted.value = true
  } catch {
    deleteError.value = DELETE_SESSION_ERROR_MESSAGE
    logError()
  } finally {
    deleting.value = false
    confirmingDelete.value = false
  }
}

useHead({ title: 'Your result' })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8 pb-16">
    <SafetyExitButton v-if="!showCrisis" />

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading your result…</p>
    </div>

    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
      <NuxtLink to="/" class="mt-4 inline-block text-indigo-700 underline">Back to Mira</NuxtLink>
    </div>

    <div v-else-if="deleted" class="mt-10 flex flex-col gap-4 text-center">
      <p class="text-base text-slate-900">{{ DELETE_SESSION_SUCCESS_MESSAGE }}</p>
      <NuxtLink to="/" class="text-indigo-700 underline">Back to Mira</NuxtLink>
    </div>

    <div v-else-if="showCrisis" class="mt-6">
      <SafetyCrisisScreen />
    </div>

    <div v-else-if="result" class="mt-6 flex flex-col gap-8">
      <!-- 1. The band, in plain language. Never a diagnosis, never a disorder name as a conclusion. -->
      <h1 class="text-2xl font-semibold text-slate-900">{{ bandIntro }}</h1>

      <!-- 1a. The escalation referral screen (FR6) — HIGH risk only; CRISIS never reaches here. -->
      <SafetyReferralScreen
        v-if="showReferral"
        :session-id="sessionId"
        :escalation-recorded="result.escalationRecorded"
      />

      <!-- 2. Numeric scores with their possible range, for both instruments. -->
      <section class="flex flex-col gap-3">
        <div class="rounded-lg border border-slate-200 px-4 py-3">
          <p class="text-sm font-medium text-slate-600">{{ PHQ9_SCORE_LABEL }}</p>
          <p class="text-lg font-semibold text-slate-900">
            {{ result.phq9Total }}
            <span class="text-sm font-normal text-slate-600">{{ PHQ9_SCORE_RANGE_LABEL }}</span>
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 px-4 py-3">
          <p class="text-sm font-medium text-slate-600">{{ GAD7_SCORE_LABEL }}</p>
          <p class="text-lg font-semibold text-slate-900">
            {{ result.gad7Total }}
            <span class="text-sm font-normal text-slate-600">{{ GAD7_SCORE_RANGE_LABEL }}</span>
          </p>
        </div>
      </section>

      <!-- 3. The rationale array from computeTriage, as a readable list. -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ RATIONALE_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ RATIONALE_INTRO }}</p>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li v-for="(line, index) in result.rationale" :key="index">{{ line }}</li>
        </ul>
      </section>

      <!-- The text-analysis explanation (FR3, NFR5) — attribution spans over the user's own
           text when available, otherwise a plain statement of why not. -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ TEXT_ANALYSIS_HEADING }}</h2>
        <template v-if="result.textAnalysis.available">
          <p class="mt-1 text-sm text-slate-600">{{ TEXT_ANALYSIS_EXPLANATION }}</p>
          <p
            class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-800"
          >
            <span
              v-for="(span, index) in result.textAnalysis.spans"
              :key="index"
              :class="
                span.highlighted ? 'rounded bg-amber-200 px-0.5 font-medium text-amber-950' : ''
              "
              >{{ span.text }}</span
            >
          </p>
        </template>
        <p v-else class="mt-1 text-sm text-slate-600">
          {{
            result.textAnalysis.reason === 'unavailable'
              ? TEXT_ANALYSIS_UNAVAILABLE_MESSAGE
              : TEXT_ANALYSIS_TEXT_FREE_MESSAGE
          }}
        </p>
      </section>

      <!-- 4. What this result is not. -->
      <section class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
        <h2 class="text-base font-semibold text-amber-900">{{ NOT_A_DIAGNOSIS_HEADING }}</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
          <li v-for="point in NOT_A_DIAGNOSIS_POINTS" :key="point">{{ point }}</li>
        </ul>
        <p class="mt-3 text-sm text-amber-900">{{ NOT_A_DIAGNOSIS_CLOSING }}</p>
      </section>

      <!-- 5. Recommended next steps and resources (FR5). -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NEXT_STEPS_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ NEXT_STEPS_INTRO }}</p>

        <ul v-if="result.resources.length > 0" class="mt-3 flex flex-col gap-2">
          <li v-for="resource in result.resources" :key="resource.slug">
            <NuxtLink
              :to="`/resources/${resource.slug}`"
              class="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
            >
              <span class="text-sm font-medium text-slate-900">{{ resource.title }}</span>
              <span class="shrink-0 text-xs text-slate-500"
                >{{ resource.readingTimeMinutes }} min read</span
              >
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-slate-700">{{ NEXT_STEPS_EMPTY_FALLBACK }}</p>

        <NuxtLink to="/resources" class="mt-3 inline-block text-sm text-indigo-700 underline">
          Browse the full resource library
        </NuxtLink>
      </section>

      <!-- 6. Delete this session's data immediately. -->
      <section class="border-t border-slate-200 pt-6">
        <p v-if="deleteError" role="alert" class="mb-3 text-sm text-red-700">{{ deleteError }}</p>

        <button
          v-if="!confirmingDelete"
          type="button"
          class="min-h-[44px] w-full rounded-lg border border-red-300 px-4 py-3 text-base font-semibold text-red-700 hover:bg-red-50"
          @click="confirmingDelete = true"
        >
          {{ DELETE_SESSION_BUTTON_LABEL }}
        </button>
        <div
          v-else
          class="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-4"
        >
          <p class="text-sm text-red-900">{{ DELETE_SESSION_CONFIRM_PROMPT }}</p>
          <div class="flex gap-3">
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 disabled:opacity-60"
              :disabled="deleting"
              @click="confirmingDelete = false"
            >
              {{ DELETE_SESSION_CANCEL_BUTTON_LABEL }}
            </button>
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg bg-red-700 px-4 py-3 text-base font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              :disabled="deleting"
              @click="handleDelete"
            >
              {{ deleting ? 'Deleting…' : DELETE_SESSION_CONFIRM_BUTTON_LABEL }}
            </button>
          </div>
        </div>
      </section>

      <NuxtLink
        to="/"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-6 py-3 text-center text-base font-semibold text-white hover:bg-indigo-700"
      >
        Done
      </NuxtLink>
      <NuxtLink to="/history" class="text-center text-sm text-indigo-700 underline">
        View past check-ins
      </NuxtLink>
    </div>
  </main>
</template>
