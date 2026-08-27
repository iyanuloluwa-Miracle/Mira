<script setup lang="ts">
// [NFR1] The privacy dashboard: what is stored (by category, in plain language), export
// (right to data portability), per-purpose consent withdrawal (taking effect immediately), and
// account deletion (a real cascade delete via server/api/privacy/delete-account.post.ts, gated
// on typing the account's own pseudonym). ensureSession() on mount rather than requiring an
// existing one — landing here with nothing stored yet should show an honest "nothing here",
// not an error, matching rule R9's anonymous-first posture.
import {
  CONSENT_PURPOSE_EFFECTS,
  CONSENT_PURPOSE_LABELS,
  CONSENT_TOGGLE_ERROR_MESSAGE,
  DASHBOARD_CONSENT_HEADING,
  DASHBOARD_CONSENT_INTRO,
  DASHBOARD_DELETE_BUTTON_LABEL,
  DASHBOARD_DELETE_CANCEL_BUTTON_LABEL,
  DASHBOARD_DELETE_CONFIRM_BUTTON_LABEL,
  DASHBOARD_DELETE_CONFIRM_LABEL,
  DASHBOARD_DELETE_ERROR_MESSAGE,
  DASHBOARD_DELETE_HEADING,
  DASHBOARD_DELETE_INTRO,
  DASHBOARD_DELETE_SUCCESS_MESSAGE,
  DASHBOARD_EXPORT_BUTTON_LABEL,
  DASHBOARD_EXPORT_ERROR_MESSAGE,
  DASHBOARD_EXPORT_HEADING,
  DASHBOARD_EXPORT_INTRO,
  DASHBOARD_INTRO,
  DASHBOARD_LOAD_ERROR_MESSAGE,
  DASHBOARD_STORED_HEADING,
  DASHBOARD_TITLE
} from '~/content/copy/privacy'

interface Category {
  key: string
  label: string
  description: string
  count: number
}

// Nuxt's typed $fetch tries to pattern-match every call's URL against every known API route
// (this app now has enough dynamic routes — /api/admin/resources/:id,
// /api/clinician/escalations/:id, etc. — that the match hits TS's "excessive stack depth"
// compiler limit on this page specifically, once a call includes a `query` or a POST body).
// Erasing $fetch's type to a plain generic function sidesteps that route-matching entirely;
// every call site below still gets a real, explicit return-type cast.
const rawFetch = $fetch as unknown as (
  url: string,
  options?: Record<string, unknown>
) => Promise<unknown>

const CONSENT_PURPOSES = ['SCREENING', 'RESEARCH_LOGGING', 'HUMAN_REVIEW'] as const
type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]

const { session, ensureSession } = useAuth()

const loading = ref(true)
const loadError = ref<string | null>(null)
const categories = ref<Category[]>([])
const consentState = ref<Record<ConsentPurpose, boolean>>({
  SCREENING: false,
  RESEARCH_LOGGING: false,
  HUMAN_REVIEW: false
})
const consentSaving = ref<ConsentPurpose | null>(null)
const consentError = ref<string | null>(null)

async function loadDashboard(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    await ensureSession()

    const [dataResponse, ...consentResponses] = await Promise.all([
      rawFetch('/api/privacy/my-data'),
      ...CONSENT_PURPOSES.map((purpose) => rawFetch('/api/privacy/consent', { query: { purpose } }))
    ])

    categories.value = (dataResponse as unknown as { categories: Category[] }).categories
    CONSENT_PURPOSES.forEach((purpose, index) => {
      consentState.value[purpose] = (
        consentResponses[index] as unknown as { active: boolean }
      ).active
    })
  } catch {
    loadError.value = DASHBOARD_LOAD_ERROR_MESSAGE
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)

async function toggleConsent(purpose: ConsentPurpose): Promise<void> {
  consentSaving.value = purpose
  consentError.value = null
  const next = !consentState.value[purpose]
  try {
    await rawFetch('/api/privacy/consent', {
      method: 'POST',
      body: { purpose, granted: next, consentVersion: '1' }
    })
    consentState.value[purpose] = next
  } catch {
    consentError.value = CONSENT_TOGGLE_ERROR_MESSAGE
  } finally {
    consentSaving.value = null
  }
}

const exporting = ref(false)
const exportError = ref<string | null>(null)

async function handleExport(): Promise<void> {
  exporting.value = true
  exportError.value = null
  try {
    const blob = (await rawFetch('/api/privacy/export', { responseType: 'blob' })) as Blob
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mira-my-data.json'
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    exportError.value = DASHBOARD_EXPORT_ERROR_MESSAGE
  } finally {
    exporting.value = false
  }
}

const confirmingDelete = ref(false)
const deleteConfirmation = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleted = ref(false)

const canConfirmDelete = computed(() => deleteConfirmation.value.trim() === session.value.pseudonym)

function handleCancelDelete(): void {
  confirmingDelete.value = false
  deleteConfirmation.value = ''
}

async function handleDelete(): Promise<void> {
  deleting.value = true
  deleteError.value = null
  try {
    await rawFetch('/api/privacy/delete-account', {
      method: 'POST',
      body: { confirmation: deleteConfirmation.value.trim() }
    })
    deleted.value = true
  } catch {
    deleteError.value = DASHBOARD_DELETE_ERROR_MESSAGE
  } finally {
    deleting.value = false
    confirmingDelete.value = false
  }
}

useHead({ title: DASHBOARD_TITLE })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">{{ DASHBOARD_TITLE }}</h1>
    <p class="mt-2 text-sm text-slate-600">{{ DASHBOARD_INTRO }}</p>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>

    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>

    <div v-else-if="deleted" class="mt-10 flex flex-col gap-4 text-center">
      <p class="text-base text-slate-900">{{ DASHBOARD_DELETE_SUCCESS_MESSAGE }}</p>
      <NuxtLink to="/" class="text-indigo-700 underline">Back to Mira</NuxtLink>
    </div>

    <div v-else class="mt-6 flex flex-col gap-8">
      <!-- 1. What is stored, by category. -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ DASHBOARD_STORED_HEADING }}</h2>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="category in categories"
            :key="category.key"
            class="rounded-lg border border-slate-200 px-4 py-3"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-slate-900">{{ category.label }}</span>
              <span
                class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
              >
                {{ category.count }}
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-600">{{ category.description }}</p>
          </li>
        </ul>
      </section>

      <!-- 2. Export (right to data portability). -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ DASHBOARD_EXPORT_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ DASHBOARD_EXPORT_INTRO }}</p>
        <p v-if="exportError" role="alert" class="mt-2 text-sm text-red-700">{{ exportError }}</p>
        <button
          type="button"
          :disabled="exporting"
          class="mt-3 min-h-[44px] w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          @click="handleExport"
        >
          {{ exporting ? 'Preparing…' : DASHBOARD_EXPORT_BUTTON_LABEL }}
        </button>
      </section>

      <!-- 3. Consent, per purpose, immediate effect. -->
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ DASHBOARD_CONSENT_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ DASHBOARD_CONSENT_INTRO }}</p>
        <p v-if="consentError" role="alert" class="mt-2 text-sm text-red-700">
          {{ consentError }}
        </p>
        <div class="mt-3 flex flex-col gap-3">
          <div
            v-for="purpose in CONSENT_PURPOSES"
            :key="purpose"
            class="rounded-lg border border-slate-200 px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-slate-900">{{
                CONSENT_PURPOSE_LABELS[purpose]
              }}</span>
              <button
                type="button"
                role="switch"
                :aria-checked="consentState[purpose]"
                :disabled="consentSaving === purpose"
                class="min-h-[32px] min-w-[52px] rounded-full px-1 transition-colors disabled:opacity-60"
                :class="consentState[purpose] ? 'bg-indigo-600' : 'bg-slate-300'"
                @click="toggleConsent(purpose)"
              >
                <span
                  class="block h-6 w-6 rounded-full bg-white shadow transition-transform"
                  :class="consentState[purpose] ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
            <p class="mt-2 text-xs text-slate-600">{{ CONSENT_PURPOSE_EFFECTS[purpose] }}</p>
          </div>
        </div>
      </section>

      <!-- 4. Delete (right to erasure). -->
      <section class="border-t border-slate-200 pt-6">
        <h2 class="text-lg font-semibold text-red-800">{{ DASHBOARD_DELETE_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ DASHBOARD_DELETE_INTRO }}</p>
        <p v-if="deleteError" role="alert" class="mt-2 text-sm text-red-700">{{ deleteError }}</p>

        <button
          v-if="!confirmingDelete"
          type="button"
          class="mt-3 min-h-[44px] w-full rounded-lg border border-red-300 px-4 py-3 text-base font-semibold text-red-700 hover:bg-red-50"
          @click="confirmingDelete = true"
        >
          {{ DASHBOARD_DELETE_BUTTON_LABEL }}
        </button>
        <div
          v-else
          class="mt-3 flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-4"
        >
          <label class="flex flex-col gap-1">
            <span class="text-sm text-red-900">{{
              DASHBOARD_DELETE_CONFIRM_LABEL(session.pseudonym ?? '')
            }}</span>
            <input
              v-model="deleteConfirmation"
              type="text"
              class="min-h-[44px] rounded-lg border border-red-300 px-4 py-3 text-base"
            />
          </label>
          <div class="flex gap-3">
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 disabled:opacity-60"
              :disabled="deleting"
              @click="handleCancelDelete"
            >
              {{ DASHBOARD_DELETE_CANCEL_BUTTON_LABEL }}
            </button>
            <button
              type="button"
              class="min-h-[44px] flex-1 rounded-lg bg-red-700 px-4 py-3 text-base font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              :disabled="deleting || !canConfirmDelete"
              @click="handleDelete"
            >
              {{ deleting ? 'Deleting…' : DASHBOARD_DELETE_CONFIRM_BUTTON_LABEL }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
