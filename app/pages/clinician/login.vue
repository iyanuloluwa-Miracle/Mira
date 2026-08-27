<script setup lang="ts">
// [FR7] Clinician sign-in. Deliberately not gated by the clinician-auth middleware (that would
// be circular) — an already-authenticated clinician landing here just gets redirected onward.
import {
  CLINICIAN_LOGIN_BUTTON_LABEL,
  CLINICIAN_LOGIN_EMAIL_LABEL,
  CLINICIAN_LOGIN_ERROR_MESSAGE,
  CLINICIAN_LOGIN_PASSWORD_LABEL,
  CLINICIAN_LOGIN_TITLE
} from '~/content/copy/clinician'

const { session, refresh, login } = useClinicianAuth()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    await refresh()
  } catch {
    // Not authenticated — stay on this page.
  }
  if (session.value.authenticated) await navigateTo('/clinician')
})

async function handleSubmit(): Promise<void> {
  submitting.value = true
  error.value = null
  try {
    await login(email.value, password.value)
    await navigateTo('/clinician')
  } catch {
    error.value = CLINICIAN_LOGIN_ERROR_MESSAGE
  } finally {
    submitting.value = false
  }
}

useHead({ title: CLINICIAN_LOGIN_TITLE })
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">{{ CLINICIAN_LOGIN_TITLE }}</h1>

    <form class="mt-6 flex flex-col gap-4" @submit.prevent="handleSubmit">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium text-slate-700">{{ CLINICIAN_LOGIN_EMAIL_LABEL }}</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="username"
          class="min-h-[44px] rounded-lg border border-slate-300 px-4 py-3 text-base"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium text-slate-700">{{ CLINICIAN_LOGIN_PASSWORD_LABEL }}</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="min-h-[44px] rounded-lg border border-slate-300 px-4 py-3 text-base"
        />
      </label>

      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {{ CLINICIAN_LOGIN_BUTTON_LABEL }}
      </button>
    </form>
  </main>
</template>
