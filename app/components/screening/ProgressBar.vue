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

// [NFR1] A literal, closed set of Tailwind arbitrary-value classes rather than a `:style`
// binding — an inline `style` attribute would need `'unsafe-inline'` in the CSP's style-src
// (server/plugins/security-headers.ts), which this app avoids everywhere, not just in
// script-src. Every string below must appear literally in source for Tailwind's scanner to
// generate the matching CSS at build time; percentage is rounded to the nearest 5% bucket.
const WIDTH_CLASSES = [
  'w-[0%]',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-[100%]'
] as const

const widthClass = computed(() => {
  const bucket = Math.min(20, Math.max(0, Math.round(percentage.value / 5)))
  return WIDTH_CLASSES[bucket]
})
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
        :class="['h-full rounded-full bg-indigo-600 transition-[width] duration-300', widthClass]"
      />
    </div>
    <p class="mt-2 text-sm text-slate-600" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </p>
  </div>
</template>
