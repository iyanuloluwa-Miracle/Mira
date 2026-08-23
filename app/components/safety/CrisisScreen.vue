<script setup lang="ts">
// [FR6][R2][R3][NFR5] The static crisis pathway's on-screen content — pre-written, reviewed
// copy from app/content/copy/postScreening.ts and helpline contacts from config/helplines.ts,
// both imported directly rather than fetched. Nothing on this screen is generated text and
// nothing here waits on a network call, so it can render the instant a CRISIS result is known
// (see app/pages/result/[sessionId].vue) with no loading state. Reused as-is by
// app/pages/support/crisis.vue, which is reachable with no session at all.
//
// Deliberately shows no scores, bands, or percentages — someone reading this may be in acute
// distress, and a number here would not help.
import {
  CRISIS_BODY_LINES,
  CRISIS_CONTINUE_LABEL,
  CRISIS_ENCOURAGEMENT,
  CRISIS_HEADLINE,
  CRISIS_HELPLINES_HEADING,
  CRISIS_HELPLINES_UNVERIFIED_NOTICE,
  CRISIS_IMMEDIATE_DANGER
} from '~/content/copy/postScreening'
import { HELPLINES } from '~~/config/helplines'

withDefaults(defineProps<{ showContinueLink?: boolean }>(), { showContinueLink: true })
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold text-slate-900">{{ CRISIS_HEADLINE }}</h1>

    <div class="flex flex-col gap-3 text-base text-slate-800">
      <p v-for="line in CRISIS_BODY_LINES" :key="line">{{ line }}</p>
    </div>

    <p class="text-base font-medium text-slate-900">{{ CRISIS_ENCOURAGEMENT }}</p>
    <p class="text-base font-medium text-slate-900">{{ CRISIS_IMMEDIATE_DANGER }}</p>

    <section aria-labelledby="crisis-helplines-heading" class="flex flex-col gap-3">
      <h2 id="crisis-helplines-heading" class="text-lg font-semibold text-slate-900">
        {{ CRISIS_HELPLINES_HEADING }}
      </h2>

      <p
        v-if="HELPLINES.some((h) => !h.verified)"
        class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        {{ CRISIS_HELPLINES_UNVERIFIED_NOTICE }}
      </p>

      <div
        v-for="helpline in HELPLINES"
        :key="helpline.name"
        class="rounded-lg border border-slate-200 px-4 py-3"
      >
        <p class="font-medium text-slate-900">{{ helpline.name }}</p>
        <a
          :href="`tel:${helpline.phone}`"
          class="inline-block min-h-[44px] py-1 text-base font-semibold text-indigo-700 underline"
        >
          {{ helpline.phone }}
        </a>
        <p class="text-sm text-slate-600">{{ helpline.availability }}</p>
      </div>
    </section>

    <NuxtLink
      v-if="showContinueLink"
      to="/"
      class="flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50"
    >
      {{ CRISIS_CONTINUE_LABEL }}
    </NuxtLink>
  </div>
</template>
