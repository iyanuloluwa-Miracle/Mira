<script setup lang="ts">
// [FR1][R9] Counterpart to login.vue. Cold registration (no prior session) uses
// server/api/auth/register.post.ts. If the visitor already has an anonymous session — the
// normal path after a private check — claim-account.post.ts upgrades that same User in place
// so screening history is preserved (see that route's own comment).
const { register, claimAccount, refresh, session } = useAuth()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  void refresh()
})

async function handleSubmit() {
  submitting.value = true
  error.value = null
  try {
    await refresh()
    if (session.value.authenticated && session.value.authMode === 'ANONYMOUS') {
      await claimAccount(email.value, password.value)
    } else {
      await register(email.value, password.value)
    }
    await navigateTo('/')
  } catch (err) {
    const fetchError = err as {
      statusCode?: number
      data?: { statusMessage?: string }
      statusMessage?: string
    }
    if (fetchError.statusCode === 429) {
      error.value = 'Too many attempts. Please wait a few minutes and try again.'
    } else if (fetchError.statusCode === 403) {
      error.value = 'Could not verify this request. Refresh the page and try again.'
    } else {
      error.value =
        fetchError.data?.statusMessage ??
        fetchError.statusMessage ??
        'Something went wrong. Please try again.'
    }
    useEvaluation().logError()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mira-atmosphere">
    <div
      class="relative mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-6 py-10"
    >
      <div>
        <h1 class="font-serif text-4xl font-bold tracking-tight text-slate-900">
          Create an account
        </h1>
        <p class="mt-2 text-sm text-slate-600">
          Not required to use Mira — you can always
          <NuxtLink to="/" class="font-medium text-teal-800 underline"
            >start a private check</NuxtLink
          >
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
            class="min-h-[44px] w-full rounded-lg border border-teal-900/20 bg-teal-900/[0.04] px-4 py-2 text-base text-slate-900 placeholder:text-slate-500"
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
            class="min-h-[44px] w-full rounded-lg border border-teal-900/20 bg-teal-900/[0.04] px-4 py-2 text-base text-slate-900 placeholder:text-slate-500"
          />
          <p class="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>

        <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>

        <button
          type="submit"
          class="min-h-[44px] rounded-lg bg-teal-700 px-6 py-3 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          :disabled="submitting"
        >
          {{ submitting ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="text-center text-sm text-slate-600">
        Already have an account?
        <NuxtLink to="/login" class="font-medium text-teal-800 underline">Sign in</NuxtLink>
      </p>

      <NuxtLink to="/" class="text-center text-sm font-medium text-teal-800 underline"
        >Back</NuxtLink
      >
    </div>
  </main>
</template>
