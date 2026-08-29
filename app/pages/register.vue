<script setup lang="ts">
// [FR1] The missing counterpart to login.vue — server/api/auth/register.post.ts has always
// supported a cold registration (no prior session required, see that file's own comment
// distinguishing it from claim-account.post.ts), it just never had a page. Minimal and
// functional, matching login.vue's own scope and style.
const { register } = useAuth()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  submitting.value = true
  error.value = null
  try {
    await register(email.value, password.value)
    await navigateTo('/')
  } catch (err) {
    const fetchError = err as { data?: { statusMessage?: string } }
    error.value = fetchError.data?.statusMessage ?? 'Something went wrong. Please try again.'
    useEvaluation().logError()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-10">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900">Create an account</h1>
      <p class="mt-2 text-sm text-slate-600">
        Not required to use Mira — you can always
        <NuxtLink to="/" class="text-indigo-700 underline">start a private check</NuxtLink>
        with no account and register later if you want one.
      </p>
    </div>

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
          minlength="8"
          autocomplete="new-password"
          class="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 py-2 text-base"
        />
        <p class="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>

      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>

      <button
        type="submit"
        class="min-h-[44px] rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        :disabled="submitting"
      >
        {{ submitting ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <p class="text-center text-sm text-slate-600">
      Already have an account?
      <NuxtLink to="/login" class="text-indigo-700 underline">Sign in</NuxtLink>
    </p>

    <NuxtLink to="/" class="text-center text-sm text-indigo-700 underline">Back</NuxtLink>
  </main>
</template>
