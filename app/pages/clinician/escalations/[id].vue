<script setup lang="ts">
// [FR7][NFR1] One escalation's detail — pseudonym only, never a real identifier (see
// server/api/clinician/escalations/[id].get.ts, which enforces this server-side; this page
// only ever renders what that route already withheld). freeText.available === false with
// reason 'withheld-by-consent' renders the explicit "withheld" state the acceptance criteria
// asks for, rather than the field silently not appearing.
import {
  CLINICIAN_DETAIL_FREE_TEXT_HEADING,
  CLINICIAN_DETAIL_FREE_TEXT_NOT_SUBMITTED,
  CLINICIAN_DETAIL_FREE_TEXT_WITHHELD,
  CLINICIAN_DETAIL_NOTES_HEADING,
  CLINICIAN_DETAIL_NOTES_PLACEHOLDER,
  CLINICIAN_DETAIL_NOTES_SAVE_LABEL,
  CLINICIAN_DETAIL_PSEUDONYM_LABEL,
  CLINICIAN_DETAIL_RATIONALE_HEADING,
  CLINICIAN_DETAIL_SAVE_ERROR_MESSAGE,
  CLINICIAN_DETAIL_STATUS_HEADING,
  CLINICIAN_STATUS_LABELS
} from '~/content/copy/clinician'

definePageMeta({ middleware: 'clinician-auth' })

type FreeText =
  | { available: true; text: string }
  | { available: false; reason: 'not-submitted' | 'withheld-by-consent' }

interface EscalationDetail {
  id: string
  status: string
  createdAt: string
  acknowledgedAt: string | null
  pseudonym: string
  riskLevel: string
  phq9Total: number
  gad7Total: number
  phq9Band: string
  gad7Band: string
  rationale: string[]
  freeText: FreeText
  notes: string | null
}

const STATUS_ORDER = ['PENDING', 'ACKNOWLEDGED', 'CONTACTED', 'CLOSED'] as const

const route = useRoute()
const id = route.params.id as string

const escalation = ref<EscalationDetail | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notesDraft = ref('')
const savingStatus = ref(false)
const savingNotes = ref(false)
const saveError = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    escalation.value = (await $fetch(
      `/api/clinician/escalations/${id}`
    )) as unknown as EscalationDetail
    notesDraft.value = escalation.value.notes ?? ''
  } catch {
    loadError.value = "We couldn't load this case."
  } finally {
    loading.value = false
  }
}

onMounted(load)

const nextStatusOptions = computed(() => {
  if (!escalation.value) return []
  const currentIndex = STATUS_ORDER.indexOf(
    escalation.value.status as (typeof STATUS_ORDER)[number]
  )
  return STATUS_ORDER.filter((_, index) => index > currentIndex)
})

async function setStatus(status: string): Promise<void> {
  savingStatus.value = true
  saveError.value = null
  try {
    await $fetch(`/api/clinician/escalations/${id}`, { method: 'PATCH', body: { status } })
    await load()
  } catch {
    saveError.value = CLINICIAN_DETAIL_SAVE_ERROR_MESSAGE
  } finally {
    savingStatus.value = false
  }
}

async function saveNotes(): Promise<void> {
  if (!notesDraft.value.trim()) return
  savingNotes.value = true
  saveError.value = null
  try {
    await $fetch(`/api/clinician/escalations/${id}`, {
      method: 'PATCH',
      body: { notes: notesDraft.value.trim() }
    })
  } catch {
    saveError.value = CLINICIAN_DETAIL_SAVE_ERROR_MESSAGE
  } finally {
    savingNotes.value = false
  }
}

useHead({ title: 'Escalation detail' })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-2xl px-6 py-8">
    <NuxtLink to="/clinician" class="text-sm text-indigo-700 underline">Back to queue</NuxtLink>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>
    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>

    <div v-else-if="escalation" class="mt-6 flex flex-col gap-6">
      <div>
        <p class="text-sm font-medium text-slate-600">{{ CLINICIAN_DETAIL_PSEUDONYM_LABEL }}</p>
        <p class="font-mono text-lg text-slate-900">{{ escalation.pseudonym }}</p>
      </div>

      <div class="flex gap-4">
        <div class="rounded-lg border border-slate-200 px-4 py-3">
          <p class="text-xs text-slate-500">Risk level</p>
          <p class="font-semibold text-slate-900">{{ escalation.riskLevel }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 px-4 py-3">
          <p class="text-xs text-slate-500">PHQ-9 / GAD-7</p>
          <p class="font-semibold text-slate-900">
            {{ escalation.phq9Total }} / {{ escalation.gad7Total }}
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 px-4 py-3">
          <p class="text-xs text-slate-500">Created</p>
          <p class="text-sm text-slate-900">
            {{ new Date(escalation.createdAt).toLocaleString() }}
          </p>
        </div>
      </div>

      <section>
        <h2 class="text-sm font-semibold text-slate-900">
          {{ CLINICIAN_DETAIL_RATIONALE_HEADING }}
        </h2>
        <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li v-for="(line, index) in escalation.rationale" :key="index">{{ line }}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-sm font-semibold text-slate-900">
          {{ CLINICIAN_DETAIL_FREE_TEXT_HEADING }}
        </h2>
        <p
          v-if="escalation.freeText.available"
          class="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-800"
        >
          {{ escalation.freeText.text }}
        </p>
        <p
          v-else-if="escalation.freeText.reason === 'withheld-by-consent'"
          class="mt-1 text-sm text-amber-800"
        >
          {{ CLINICIAN_DETAIL_FREE_TEXT_WITHHELD }}
        </p>
        <p v-else class="mt-1 text-sm text-slate-600">
          {{ CLINICIAN_DETAIL_FREE_TEXT_NOT_SUBMITTED }}
        </p>
      </section>

      <section>
        <h2 class="text-sm font-semibold text-slate-900">{{ CLINICIAN_DETAIL_STATUS_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">
          Current: {{ CLINICIAN_STATUS_LABELS[escalation.status] }}
        </p>
        <div v-if="nextStatusOptions.length > 0" class="mt-2 flex gap-2">
          <button
            v-for="option in nextStatusOptions"
            :key="option"
            type="button"
            :disabled="savingStatus"
            class="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            @click="setStatus(option)"
          >
            {{ CLINICIAN_STATUS_LABELS[option] }}
          </button>
        </div>
      </section>

      <section>
        <h2 class="text-sm font-semibold text-slate-900">{{ CLINICIAN_DETAIL_NOTES_HEADING }}</h2>
        <textarea
          v-model="notesDraft"
          rows="5"
          :placeholder="CLINICIAN_DETAIL_NOTES_PLACEHOLDER"
          class="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
        <button
          type="button"
          :disabled="savingNotes || !notesDraft.trim()"
          class="mt-2 min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          @click="saveNotes"
        >
          {{ CLINICIAN_DETAIL_NOTES_SAVE_LABEL }}
        </button>
      </section>

      <p v-if="saveError" role="alert" class="text-sm text-red-700">{{ saveError }}</p>
    </div>
  </main>
</template>
