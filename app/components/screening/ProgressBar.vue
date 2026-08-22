<script setup lang="ts">
// [Accessibility][NFR5] A single element carries the visible progress text AND the aria-live
// announcement — one source, so a screen reader never hears it twice. aria-atomic re-reads the
// whole phrase on each change rather than trying to diff it, which reads far more naturally
// for short status text like this.
const props = defineProps<{
  current: number // 1-indexed
  total: number
}>()

const percentage = computed(() =>
  props.total > 0 ? Math.round((props.current / props.total) * 100) : 0
)
const announcement = computed(() => `Question ${props.current} of ${props.total}`)
</script>

<template>
  <div class="w-full">
    <div
      class="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      :aria-valuenow="current"
      :aria-valuemin="1"
      :aria-valuemax="total"
      :aria-label="announcement"
    >
      <div
        class="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
        :style="{ width: `${percentage}%` }"
      />
    </div>
    <p class="mt-2 text-sm text-slate-600" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </p>
  </div>
</template>
