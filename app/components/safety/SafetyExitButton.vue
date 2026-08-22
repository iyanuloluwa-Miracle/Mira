<script setup lang="ts">
// [R3] A real link, not a click handler — it works with no JavaScript at all, and NuxtLink
// prefetches the target route's chunk once this button is visible (it's persistent on every
// screening screen, so it's visible immediately), so by the time anyone actually needs it, the
// crisis page has nothing left to load. See app/pages/support/crisis.vue, which is also
// prerendered (nuxt.config.ts routeRules) so there's no server work to wait on either.
</script>

<template>
  <NuxtLink
    to="/support/crisis"
    prefetch
    class="fixed right-4 bottom-4 z-50 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-800"
  >
    <span aria-hidden="true">⚠</span>
    <span>I need help now</span>
  </NuxtLink>
</template>
