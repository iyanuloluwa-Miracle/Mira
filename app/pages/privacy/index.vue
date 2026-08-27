<script setup lang="ts">
// [NFR1] The public privacy notice — reachable with no session and no account, same as the
// resource library and the crisis page. Purely static: every string here is imported from
// ~/content/copy/privacy, never generated or fetched.
import {
  NOTICE_CATEGORIES_HEADING,
  NOTICE_CATEGORIES_POINTS,
  NOTICE_CONTACT_BODY,
  NOTICE_CONTACT_HEADING,
  NOTICE_INTRO,
  NOTICE_LAWFUL_BASIS_BODY,
  NOTICE_LAWFUL_BASIS_HEADING,
  NOTICE_PURPOSE_HEADING,
  NOTICE_PURPOSE_POINTS,
  NOTICE_RETENTION_HEADING,
  NOTICE_RETENTION_POINTS,
  NOTICE_RIGHTS_ACCESS,
  NOTICE_RIGHTS_ERASURE,
  NOTICE_RIGHTS_HEADING,
  NOTICE_RIGHTS_LINK_LABEL,
  NOTICE_RIGHTS_NOT_YET_HEADING,
  NOTICE_RIGHTS_NOT_YET_POINTS,
  NOTICE_RIGHTS_WITHDRAW,
  NOTICE_TITLE,
  NOTICE_WHO_BODY,
  NOTICE_WHO_HEADING
} from '~/content/copy/privacy'

useHead({ title: NOTICE_TITLE })
</script>

<template>
  <main class="mx-auto min-h-svh max-w-md px-6 py-8">
    <h1 class="text-2xl font-semibold text-slate-900">{{ NOTICE_TITLE }}</h1>
    <p class="mt-2 text-sm text-slate-600">{{ NOTICE_INTRO }}</p>

    <div class="mt-6 flex flex-col gap-8">
      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_WHO_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ NOTICE_WHO_BODY }}</p>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_PURPOSE_HEADING }}</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li v-for="point in NOTICE_PURPOSE_POINTS" :key="point">{{ point }}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_LAWFUL_BASIS_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ NOTICE_LAWFUL_BASIS_BODY }}</p>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_CATEGORIES_HEADING }}</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li v-for="point in NOTICE_CATEGORIES_POINTS" :key="point">{{ point }}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_RETENTION_HEADING }}</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li v-for="point in NOTICE_RETENTION_POINTS" :key="point">{{ point }}</li>
        </ul>
      </section>

      <section class="rounded-lg border border-slate-200 px-4 py-4">
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_RIGHTS_HEADING }}</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>{{ NOTICE_RIGHTS_ACCESS }}</li>
          <li>{{ NOTICE_RIGHTS_ERASURE }}</li>
          <li>{{ NOTICE_RIGHTS_WITHDRAW }}</li>
        </ul>
        <NuxtLink
          to="/privacy/my-data"
          class="mt-3 inline-block min-h-[44px] rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {{ NOTICE_RIGHTS_LINK_LABEL }}
        </NuxtLink>

        <h3 class="mt-4 text-sm font-semibold text-amber-900">
          {{ NOTICE_RIGHTS_NOT_YET_HEADING }}
        </h3>
        <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
          <li v-for="point in NOTICE_RIGHTS_NOT_YET_POINTS" :key="point">{{ point }}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-slate-900">{{ NOTICE_CONTACT_HEADING }}</h2>
        <p class="mt-1 text-sm text-slate-700">{{ NOTICE_CONTACT_BODY }}</p>
      </section>
    </div>
  </main>
</template>
