<script setup lang="ts">
// [FR5] The resource library's listing page. No screening session and no account required —
// GET /api/resources carries no auth check at all, so this page never calls requireUser or
// gates on useAuth(); it fetches and renders the same way for anyone who lands here directly.
import {
  RESOURCES_LIST_EMPTY,
  RESOURCES_LIST_ERROR,
  RESOURCES_LIST_INTRO,
  RESOURCES_LIST_LOADING,
  RESOURCES_LIST_TITLE,
  readingTimeLabel
} from '~/content/copy/resources'

interface ResourceListItem {
  slug: string
  title: string
  tags: string[]
  readingTimeMinutes: number
}

const resources = ref<ResourceListItem[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const response = (await $fetch('/api/resources')) as unknown as {
      resources: ResourceListItem[]
    }
    resources.value = response.resources
  } catch {
    loadError.value = RESOURCES_LIST_ERROR
  } finally {
    loading.value = false
  }
})

useHead({ title: RESOURCES_LIST_TITLE })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">{{ RESOURCES_LIST_TITLE }}</h1>
    <p class="mt-2 text-sm text-slate-600">{{ RESOURCES_LIST_INTRO }}</p>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">{{ RESOURCES_LIST_LOADING }}</p>
    </div>

    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>

    <div v-else-if="resources.length === 0" class="mt-10 text-center">
      <p class="text-base text-slate-600">{{ RESOURCES_LIST_EMPTY }}</p>
    </div>

    <ul v-else class="mt-6 flex flex-col gap-2">
      <li v-for="resource in resources" :key="resource.slug">
        <NuxtLink
          :to="`/resources/${resource.slug}`"
          class="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
        >
          <span class="text-sm font-medium text-slate-900">{{ resource.title }}</span>
          <span class="shrink-0 text-xs text-slate-500">{{
            readingTimeLabel(resource.readingTimeMinutes)
          }}</span>
        </NuxtLink>
      </li>
    </ul>
  </main>
</template>
