<script setup lang="ts">
// [R3] The message text and helplines are imported directly, not fetched — this page has zero
// data dependency, so there is nothing to be "loading" no matter how it's reached (direct URL,
// the persistent SafetyExitButton, or a CRISIS screening result). Also prerendered
// (nuxt.config.ts routeRules), so there's no server-side work on top of that either.
import { CRISIS_INSTRUCTION, CRISIS_MESSAGE } from '~~/shared/copy/crisis'
import { HELPLINES } from '~~/config/helplines'

useHead({ title: 'Get help now' })
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-6 py-10">
    <h1 class="text-2xl font-semibold text-slate-900">You're not alone</h1>

    <p class="text-base text-slate-800">{{ CRISIS_MESSAGE }}</p>
    <p class="text-base font-medium text-slate-900">{{ CRISIS_INSTRUCTION }}</p>

    <section aria-labelledby="helplines-heading" class="flex flex-col gap-3">
      <h2 id="helplines-heading" class="text-lg font-semibold text-slate-900">Support contacts</h2>

      <p
        v-if="HELPLINES.some((h) => !h.verified)"
        class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        The contacts below are placeholders pending verification and are not yet real, dialable
        numbers.
      </p>

      <div
        v-for="helpline in HELPLINES"
        :key="helpline.name"
        class="rounded-lg border border-slate-200 px-4 py-3"
      >
        <p class="font-medium text-slate-900">{{ helpline.name }}</p>
        <p class="text-sm text-slate-700">{{ helpline.phone }}</p>
        <p class="text-sm text-slate-600">{{ helpline.availability }}</p>
      </div>
    </section>

    <NuxtLink
      to="/"
      class="flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50"
    >
      Back
    </NuxtLink>
  </main>
</template>
