<script setup lang="ts">
// [FR7] Admin-only resource management — ADMIN role required server-side
// (server/api/admin/resources/*, requireAdmin). A plain CLINICIAN account reaching this page
// still passes the clinician-auth middleware (it only checks *a* session exists) but every
// fetch here gets a 403, which this page turns into CLINICIAN_RESOURCES_FORBIDDEN_MESSAGE
// rather than a raw error.
import {
  CLINICIAN_RESOURCES_ACTIVATE_LABEL,
  CLINICIAN_RESOURCES_DEACTIVATE_LABEL,
  CLINICIAN_RESOURCES_FORBIDDEN_MESSAGE,
  CLINICIAN_RESOURCES_NEW_BUTTON_LABEL,
  CLINICIAN_RESOURCES_SAVE_LABEL,
  CLINICIAN_RESOURCES_TITLE
} from '~/content/copy/clinician'

definePageMeta({ middleware: 'clinician-auth' })

const RISK_LEVELS = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS'] as const

interface AdminResource {
  id: string
  title: string
  slug: string
  body: string
  tags: string[]
  minRisk: string
  maxRisk: string
  readingTimeMinutes: number
  language: string
  sourceAttribution: string
  isActive: boolean
}

interface ResourceForm {
  title: string
  slug: string
  body: string
  tags: string
  minRisk: string
  maxRisk: string
  readingTimeMinutes: number
  language: string
  sourceAttribution: string
}

function blankForm(): ResourceForm {
  return {
    title: '',
    slug: '',
    body: '',
    tags: '',
    minRisk: 'MINIMAL',
    maxRisk: 'HIGH',
    readingTimeMinutes: 3,
    language: 'en',
    sourceAttribution: ''
  }
}

const resources = ref<AdminResource[]>([])
const loading = ref(true)
const forbidden = ref(false)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)

const showNewForm = ref(false)
const newForm = ref<ResourceForm>(blankForm())
const editingId = ref<string | null>(null)
const editForm = ref<ResourceForm>(blankForm())

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  forbidden.value = false
  try {
    const response = (await $fetch('/api/admin/resources')) as unknown as {
      resources: AdminResource[]
    }
    resources.value = response.resources
  } catch (error: unknown) {
    if ((error as { statusCode?: number }).statusCode === 403) {
      forbidden.value = true
    } else {
      loadError.value = "We couldn't load resources."
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toPayload(form: ResourceForm) {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    language: form.language.trim(),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    minRisk: form.minRisk,
    maxRisk: form.maxRisk,
    readingTimeMinutes: Number(form.readingTimeMinutes),
    sourceAttribution: form.sourceAttribution.trim()
  }
}

async function createResource(): Promise<void> {
  actionError.value = null
  try {
    await $fetch('/api/admin/resources', {
      method: 'POST',
      body: { ...toPayload(newForm.value), slug: newForm.value.slug.trim() }
    })
    showNewForm.value = false
    newForm.value = blankForm()
    await load()
  } catch {
    actionError.value = "That resource couldn't be created."
  }
}

function startEdit(resource: AdminResource): void {
  editingId.value = resource.id
  editForm.value = {
    title: resource.title,
    slug: resource.slug,
    body: resource.body,
    tags: resource.tags.join(', '),
    minRisk: resource.minRisk,
    maxRisk: resource.maxRisk,
    readingTimeMinutes: resource.readingTimeMinutes,
    language: resource.language,
    sourceAttribution: resource.sourceAttribution
  }
}

async function saveEdit(id: string): Promise<void> {
  actionError.value = null
  try {
    await $fetch(`/api/admin/resources/${id}`, { method: 'PATCH', body: toPayload(editForm.value) })
    editingId.value = null
    await load()
  } catch {
    actionError.value = "That change couldn't be saved."
  }
}

async function toggleActive(resource: AdminResource): Promise<void> {
  actionError.value = null
  try {
    await $fetch(`/api/admin/resources/${resource.id}`, {
      method: 'PATCH',
      body: { isActive: !resource.isActive }
    })
    await load()
  } catch {
    actionError.value = "That change couldn't be saved."
  }
}

useHead({ title: CLINICIAN_RESOURCES_TITLE })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-2xl px-6 py-8">
    <NuxtLink to="/clinician" class="text-sm text-indigo-700 underline">Back to queue</NuxtLink>
    <h1 class="mt-2 text-2xl font-semibold text-slate-900">{{ CLINICIAN_RESOURCES_TITLE }}</h1>

    <div v-if="loading" class="mt-10 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>
    <div v-else-if="forbidden" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ CLINICIAN_RESOURCES_FORBIDDEN_MESSAGE }}</p>
    </div>
    <div v-else-if="loadError" class="mt-10 text-center">
      <p class="text-base text-slate-900">{{ loadError }}</p>
    </div>

    <template v-else>
      <p v-if="actionError" role="alert" class="mt-4 text-sm text-red-700">{{ actionError }}</p>

      <button
        type="button"
        class="mt-4 min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        @click="showNewForm = !showNewForm"
      >
        {{ CLINICIAN_RESOURCES_NEW_BUTTON_LABEL }}
      </button>

      <form
        v-if="showNewForm"
        class="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
        @submit.prevent="createResource"
      >
        <input
          v-model="newForm.title"
          placeholder="Title"
          class="rounded border px-3 py-2 text-sm"
        />
        <input
          v-model="newForm.slug"
          placeholder="slug-in-kebab-case"
          class="rounded border px-3 py-2 text-sm"
        />
        <textarea
          v-model="newForm.body"
          placeholder="Markdown body"
          rows="4"
          class="rounded border px-3 py-2 text-sm"
        />
        <input
          v-model="newForm.tags"
          placeholder="tags, comma, separated"
          class="rounded border px-3 py-2 text-sm"
        />
        <div class="flex gap-2">
          <select v-model="newForm.minRisk" class="rounded border px-3 py-2 text-sm">
            <option v-for="level in RISK_LEVELS" :key="level" :value="level">{{ level }}</option>
          </select>
          <select v-model="newForm.maxRisk" class="rounded border px-3 py-2 text-sm">
            <option v-for="level in RISK_LEVELS" :key="level" :value="level">{{ level }}</option>
          </select>
          <input
            v-model.number="newForm.readingTimeMinutes"
            type="number"
            min="1"
            class="w-24 rounded border px-3 py-2 text-sm"
          />
        </div>
        <input
          v-model="newForm.sourceAttribution"
          placeholder="Source attribution"
          class="rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          class="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {{ CLINICIAN_RESOURCES_SAVE_LABEL }}
        </button>
      </form>

      <ul class="mt-6 flex flex-col gap-3">
        <li
          v-for="resource in resources"
          :key="resource.id"
          class="rounded-lg border border-slate-200 p-4"
        >
          <template v-if="editingId === resource.id">
            <div class="flex flex-col gap-2">
              <input v-model="editForm.title" class="rounded border px-3 py-2 text-sm" />
              <textarea v-model="editForm.body" rows="4" class="rounded border px-3 py-2 text-sm" />
              <input v-model="editForm.tags" class="rounded border px-3 py-2 text-sm" />
              <div class="flex gap-2">
                <select v-model="editForm.minRisk" class="rounded border px-3 py-2 text-sm">
                  <option v-for="level in RISK_LEVELS" :key="level" :value="level">
                    {{ level }}
                  </option>
                </select>
                <select v-model="editForm.maxRisk" class="rounded border px-3 py-2 text-sm">
                  <option v-for="level in RISK_LEVELS" :key="level" :value="level">
                    {{ level }}
                  </option>
                </select>
                <input
                  v-model.number="editForm.readingTimeMinutes"
                  type="number"
                  min="1"
                  class="w-24 rounded border px-3 py-2 text-sm"
                />
              </div>
              <input
                v-model="editForm.sourceAttribution"
                class="rounded border px-3 py-2 text-sm"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                  @click="saveEdit(resource.id)"
                >
                  {{ CLINICIAN_RESOURCES_SAVE_LABEL }}
                </button>
                <button
                  type="button"
                  class="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  @click="editingId = null"
                >
                  Cancel
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-slate-900">{{ resource.title }}</p>
                <p class="text-xs text-slate-500">
                  {{ resource.slug }} — {{ resource.minRisk }}–{{ resource.maxRisk }}
                </p>
                <p
                  class="text-xs"
                  :class="resource.isActive ? 'text-emerald-700' : 'text-slate-400'"
                >
                  {{ resource.isActive ? 'Active' : 'Inactive' }}
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="text-sm text-indigo-700 underline"
                  @click="startEdit(resource)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="text-sm text-indigo-700 underline"
                  @click="toggleActive(resource)"
                >
                  {{
                    resource.isActive
                      ? CLINICIAN_RESOURCES_DEACTIVATE_LABEL
                      : CLINICIAN_RESOURCES_ACTIVATE_LABEL
                  }}
                </button>
              </div>
            </div>
          </template>
        </li>
      </ul>
    </template>
  </main>
</template>
