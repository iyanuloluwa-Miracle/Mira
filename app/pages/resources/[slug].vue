<script setup lang="ts">
// [FR5][NFR2] One resource's full content. No screening session and no account required, same
// as the listing page. bodyHtml is rendered with v-html — safe here because it is fully trusted,
// server-rendered markdown from content/resources/*.md (never user input); see
// server/api/resources/[slug].get.ts for the same reasoning on the server side.
//
// "Remain readable after going offline" (FR5 acceptance) is implemented as cache-on-visit, not
// a full offline-first PWA: a successful fetch is stashed in this device's own localStorage
// keyed by slug, and a failed fetch falls back to that cached copy if one exists. There is no
// service worker in this app (see docs/frontend-metrics.md) — a page can only be readable
// offline once it has actually been visited online first, which is the realistic scope FR5 asks
// for.
import {
  RESOURCES_BACK_TO_LIST_LABEL,
  RESOURCES_DETAIL_LOADING,
  RESOURCES_DETAIL_NOT_FOUND,
  RESOURCES_DETAIL_OFFLINE_NOTICE,
  RESOURCES_SOURCE_LABEL,
  TEXT_SIZE_CONTROL_LABEL,
  TEXT_SIZE_OPTIONS,
  readingTimeLabel
} from '~/content/copy/resources'

interface ResourceDetail {
  slug: string
  title: string
  tags: string[]
  minRisk: string
  maxRisk: string
  readingTimeMinutes: number
  language: string
  sourceAttribution: string
  bodyHtml: string
}

type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]['value']

const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
}

const route = useRoute()
const slug = route.params.slug as string

function cacheKey(forSlug: string): string {
  return `mira-resource-${forSlug}`
}

function readCache(forSlug: string): ResourceDetail | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(cacheKey(forSlug))
    return raw ? (JSON.parse(raw) as ResourceDetail) : null
  } catch {
    return null
  }
}

function writeCache(forSlug: string, value: ResourceDetail): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(cacheKey(forSlug), JSON.stringify(value))
  } catch {
    // Storage full or unavailable (private browsing) — the live page still works, only the
    // offline-readable benefit is lost for this resource.
  }
}

const resource = ref<ResourceDetail | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const servedFromCache = ref(false)

onMounted(async () => {
  try {
    const fetched = (await $fetch(`/api/resources/${slug}`)) as unknown as ResourceDetail
    resource.value = fetched
    servedFromCache.value = false
    writeCache(slug, fetched)
  } catch {
    const cached = readCache(slug)
    if (cached) {
      resource.value = cached
      servedFromCache.value = true
    } else {
      loadError.value = RESOURCES_DETAIL_NOT_FOUND
    }
  } finally {
    loading.value = false
  }
})

const textSize = ref<TextSize>('md')

onMounted(() => {
  try {
    const stored = localStorage.getItem('mira-resource-text-size')
    if (stored === 'sm' || stored === 'md' || stored === 'lg') textSize.value = stored
  } catch {
    // Default size stands.
  }
})

function setTextSize(value: TextSize): void {
  textSize.value = value
  try {
    localStorage.setItem('mira-resource-text-size', value)
  } catch {
    // Not persisted this time, but still applied for the current view.
  }
}

useHead(() => ({ title: resource.value?.title ?? RESOURCES_DETAIL_LOADING }))
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <NuxtLink to="/resources" class="text-sm text-indigo-700 underline">
      {{ RESOURCES_BACK_TO_LIST_LABEL }}
    </NuxtLink>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">{{ RESOURCES_DETAIL_LOADING }}</p>
    </div>

    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>

    <article v-else-if="resource" class="mt-6 flex flex-col gap-4">
      <p
        v-if="servedFromCache"
        class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        {{ RESOURCES_DETAIL_OFFLINE_NOTICE }}
      </p>

      <div>
        <h1 class="text-2xl font-semibold text-slate-900">{{ resource.title }}</h1>
        <p class="mt-1 text-xs text-slate-500">
          {{ readingTimeLabel(resource.readingTimeMinutes) }}
        </p>
      </div>

      <div
        role="group"
        :aria-label="TEXT_SIZE_CONTROL_LABEL"
        class="flex items-center gap-2 self-start rounded-lg border border-slate-200 p-1"
      >
        <button
          v-for="option in TEXT_SIZE_OPTIONS"
          :key="option.value"
          type="button"
          :aria-pressed="textSize === option.value"
          :aria-label="option.label"
          class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md font-semibold text-slate-700"
          :class="[
            textSize === option.value ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100',
            option.value === 'sm' ? 'text-xs' : option.value === 'lg' ? 'text-base' : 'text-sm'
          ]"
          @click="setTextSize(option.value)"
        >
          {{ option.display }}
        </button>
      </div>

      <!-- No @tailwindcss/typography plugin is installed (NFR2 — one fewer dependency), so the
           rendered markdown's headings/lists/paragraphs are styled directly with child-selector
           utilities here rather than a `prose` class that would otherwise do nothing. -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="flex flex-col gap-3 text-slate-800 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
        :class="TEXT_SIZE_CLASSES[textSize]"
        v-html="resource.bodyHtml"
      />
      <!-- eslint-enable vue/no-v-html -->

      <p class="border-t border-slate-200 pt-4 text-xs text-slate-500">
        {{ RESOURCES_SOURCE_LABEL }}: {{ resource.sourceAttribution }}
      </p>
    </article>
  </main>
</template>
