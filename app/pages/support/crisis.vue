<script setup lang="ts">
// [R3] Zero data dependency — CrisisScreen renders entirely from static imports, so there is
// nothing to be "loading" no matter how this page is reached (direct URL, the persistent
// SafetyExitButton, or a CRISIS screening result on app/pages/result/[sessionId].vue, which
// shows the same component inline instead of redirecting here). Prerendered
// (nuxt.config.ts routeRules) so there's no server-side work on top of that either.
useHead({ title: 'Get help now' })
</script>

<template>
  <main class="mx-auto max-w-md px-6 py-10">
    <SafetyCrisisScreen />
  </main>
</template>
