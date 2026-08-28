<script setup lang="ts">
// Minimal, functional sign-in so the landing page's second action isn't a dead link — prompt 8
// is scoped to the screening flow; a fuller auth UI belongs to a later prompt.
const { login } = useAuth()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  submitting.value = true
  error.value = null
  try {
    await login(email.value, password.value)
    await navigateTo('/')
  } catch {
    error.value = 'Incorrect email or password.'
    useEvaluation().logError()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-10">
    <h1 class="text-2xl font-semibold text-slate-900">Sign in</h1>

    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <div>
        <label for="email" class="mb-1 block text-sm font-medium text-slate-900">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 py-2 text-base"
        />
      </div>
      <div>
        <label for="password" class="mb-1 block text-sm font-medium text-slate-900">
          Password
        </label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 py-2 text-base"
        />
      </div>

      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>

      <button
        type="submit"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        :disabled="submitting"
      >
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="text-center text-sm text-slate-600">
      Don't have an account?
      <NuxtLink to="/register" class="text-indigo-700 underline">Create one</NuxtLink>
    </p>

    <NuxtLink to="/" class="text-center text-sm text-indigo-700 underline">Back</NuxtLink>
  </main>
</template>
