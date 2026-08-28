<script setup lang="ts">
// [NFR3] Latency (p50/p95/p99 per operation) and triage-band distribution, as simple bar charts
// — screenshot-ready evidence for the results chapter. ADMIN-gated, same pattern as
// app/pages/clinician/resources/index.vue: clinician-auth middleware only checks *a* session
// exists, and a plain (non-admin) clinician account gets a 403 from the server, shown below as
// FORBIDDEN_MESSAGE rather than a raw error.
definePageMeta({ middleware: 'clinician-auth' })

interface LatencyRow {
  name: string
  count: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
}

interface TriageRow {
  riskLevel: string
  count: number
}

const FORBIDDEN_MESSAGE = 'This page is only available to admin accounts.'

const loading = ref(true)
const error = ref<string | null>(null)
const latency = ref<LatencyRow[]>([])
const triageDistribution = ref<TriageRow[]>([])

const maxP95 = computed(() => Math.max(1, ...latency.value.map((row) => row.p95Ms ?? 0)))
const maxTriageCount = computed(() => Math.max(1, ...triageDistribution.value.map((r) => r.count)))

const RISK_ORDER = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS']
const orderedTriage = computed(() =>
  [...triageDistribution.value].sort(
    (a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel)
  )
)

onMounted(async () => {
  try {
    const response = await $fetch<{ latency: LatencyRow[]; triageDistribution: TriageRow[] }>(
      '/api/admin/metrics'
    )
    latency.value = response.latency
    triageDistribution.value = response.triageDistribution
  } catch (err) {
    const fetchError = err as { statusCode?: number }
    error.value = fetchError.statusCode === 403 ? FORBIDDEN_MESSAGE : "Couldn't load metrics."
  } finally {
    loading.value = false
  }
})

useHead({ title: 'Metrics' })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-2xl px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">Metrics</h1>
    <p class="mt-2 text-sm text-slate-600">
      Latency evidence for NFR3, and the triage-band distribution across every completed screening.
    </p>

    <div v-if="loading" class="mt-10 text-center text-slate-600">Loading…</div>
    <div v-else-if="error" class="mt-10 text-center text-slate-900">{{ error }}</div>

    <div v-else class="mt-8 flex flex-col gap-10">
      <section>
        <h2 class="text-lg font-semibold text-slate-900">Latency (ms)</h2>
        <p class="mt-1 text-xs text-slate-500">
          Bar length is p95, relative to the slowest operation below. Exact p50/p95/p99 and counts
          are listed alongside each bar.
        </p>

        <div v-if="latency.length === 0" class="mt-4 text-sm text-slate-600">
          No latency observations yet — complete a screening, submit free text, or send a chat
          message to produce some.
        </div>

        <ul v-else class="mt-4 flex flex-col gap-3">
          <li v-for="row in latency" :key="row.name">
            <div class="flex items-baseline justify-between text-sm">
              <span class="font-medium text-slate-900">{{ row.name }}</span>
              <span class="text-xs text-slate-500">n={{ row.count }}</span>
            </div>
            <div class="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                :class="[
                  'h-full rounded-full bg-indigo-600',
                  useWidthClass(((row.p95Ms ?? 0) / maxP95) * 100)
                ]"
              />
            </div>
            <p class="mt-1 text-xs text-slate-600">
              p50 {{ row.p50Ms }}ms · p95 {{ row.p95Ms }}ms · p99 {{ row.p99Ms }}ms
            </p>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">Triage-band distribution</h2>
        <p class="mt-1 text-xs text-slate-500">Every completed screening, by risk band.</p>

        <div v-if="orderedTriage.length === 0" class="mt-4 text-sm text-slate-600">
          No completed screenings yet.
        </div>

        <ul v-else class="mt-4 flex flex-col gap-3">
          <li v-for="row in orderedTriage" :key="row.riskLevel">
            <div class="flex items-baseline justify-between text-sm">
              <span class="font-medium text-slate-900">{{ row.riskLevel }}</span>
              <span class="text-xs text-slate-500">{{ row.count }}</span>
            </div>
            <div class="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                :class="[
                  'h-full rounded-full bg-emerald-600',
                  useWidthClass((row.count / maxTriageCount) * 100)
                ]"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>

    <NuxtLink
      to="/admin/evaluation"
      class="mt-8 block text-center text-sm text-indigo-700 underline"
    >
      Evaluation sessions
    </NuxtLink>
  </main>
</template>
