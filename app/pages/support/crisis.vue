<script setup lang="ts">
// [R3] Zero data dependency — CrisisScreen renders entirely from static imports, so there is
// nothing to be "loading" no matter how this page is reached (direct URL, the persistent
// SafetyExitButton, or a CRISIS screening result on app/pages/result/[sessionId].vue, which
// shows the same component inline instead of redirecting here). Prerendered
// (nuxt.config.ts routeRules) so there's no server-side work on top of that either.
useHead({ title: 'Get help now' })
</script>

<template>
  <main class="mira-atmosphere">
    <div class="relative mx-auto w-full max-w-lg px-5 py-8 pb-10 sm:px-8">
      <SafetyCrisisScreen />
    </div>
  </main>
</template>
