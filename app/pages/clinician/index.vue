<script setup lang="ts">
// [FR7] The escalation queue — sorted by risk then age server-side
// (server/api/clinician/escalations/index.get.ts), filterable by status here.
import {
  CLINICIAN_LOGOUT_LABEL,
  CLINICIAN_QUEUE_EMPTY_MESSAGE,
  CLINICIAN_QUEUE_FILTER_ALL_LABEL,
  CLINICIAN_QUEUE_FILTER_LABEL,
  CLINICIAN_QUEUE_TITLE,
  CLINICIAN_STATUS_LABELS
} from '~/content/copy/clinician'

definePageMeta({ middleware: 'clinician-auth' })

interface EscalationListItem {
  id: string
  status: string
  riskLevel: string
  createdAt: string
  pseudonym: string
}

const STATUS_OPTIONS = ['PENDING', 'ACKNOWLEDGED', 'CONTACTED', 'CLOSED'] as const

const { session, refresh, logout } = useClinicianAuth()
onMounted(() => {
  if (!session.value.authenticated) refresh().catch(() => {})
})

const escalations = ref<EscalationListItem[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const statusFilter = ref<string>('')

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const query = statusFilter.value ? `?status=${statusFilter.value}` : ''
    const response = (await $fetch(`/api/clinician/escalations${query}`)) as unknown as {
      escalations: EscalationListItem[]
    }
    escalations.value = response.escalations
  } catch {
    loadError.value = 'Could not load the queue.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(statusFilter, load)

async function handleLogout(): Promise<void> {
  await logout()
  await navigateTo('/clinician/login')
}

useHead({ title: CLINICIAN_QUEUE_TITLE })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-2xl px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-slate-900">{{ CLINICIAN_QUEUE_TITLE }}</h1>
      <div class="flex items-center gap-4">
        <NuxtLink
          v-if="session.role === 'ADMIN'"
          to="/clinician/resources"
          class="text-sm text-indigo-700 underline"
        >
          Resources
        </NuxtLink>
        <button type="button" class="text-sm text-indigo-700 underline" @click="handleLogout">
          {{ CLINICIAN_LOGOUT_LABEL }}
        </button>
      </div>
    </div>

    <label class="mt-4 flex items-center gap-2">
      <span class="text-sm font-medium text-slate-700">{{ CLINICIAN_QUEUE_FILTER_LABEL }}</span>
      <select
        v-model="statusFilter"
        class="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">{{ CLINICIAN_QUEUE_FILTER_ALL_LABEL }}</option>
        <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">
          {{ CLINICIAN_STATUS_LABELS[option] }}
        </option>
      </select>
    </label>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>
    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>
    <div v-else-if="escalations.length === 0" class="mt-10 text-center">
      <p class="text-base text-slate-600">{{ CLINICIAN_QUEUE_EMPTY_MESSAGE }}</p>
    </div>

    <ul v-else class="mt-6 flex flex-col gap-2">
      <li v-for="escalation in escalations" :key="escalation.id">
        <NuxtLink
          :to="`/clinician/escalations/${escalation.id}`"
          class="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
        >
          <span class="flex items-center gap-3">
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="
                escalation.riskLevel === 'CRISIS'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              {{ escalation.riskLevel }}
            </span>
            <span class="font-mono text-sm text-slate-900">{{ escalation.pseudonym }}</span>
          </span>
          <span class="flex items-center gap-3 text-xs text-slate-500">
            <span>{{ CLINICIAN_STATUS_LABELS[escalation.status] }}</span>
            <span>{{ new Date(escalation.createdAt).toLocaleString() }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
