<script setup lang="ts">
// [Accessibility][NFR2] A real <fieldset>/<legend> radio group — not a set of styled <div>s —
// so it's a native, keyboard-operable, screen-reader-correct group with no ARIA to get wrong.
// Every option is at least 44px tall (Accessibility: tap target size) and the whole label is
// clickable, not just the small radio circle.
interface ResponseOption {
  value: number
  label: string
}

defineProps<{
  itemCode: string
  prompt: string
  options: readonly ResponseOption[]
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<template>
  <fieldset class="w-full border-0 p-0">
    <legend class="mb-5 text-xl font-medium text-slate-900">{{ prompt }}</legend>
    <div class="flex flex-col gap-3">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 text-base"
        :class="
          modelValue === option.value
            ? 'border-indigo-600 bg-indigo-50'
            : 'border-slate-200 bg-white hover:border-slate-400'
        "
      >
        <input
          type="radio"
          :name="`item-${itemCode}`"
          :value="option.value"
          :checked="modelValue === option.value"
          class="h-5 w-5 shrink-0 accent-indigo-600"
          @change="emit('update:modelValue', option.value)"
        />
        <span class="text-slate-900">{{ option.label }}</span>
      </label>
    </div>
  </fieldset>
</template>
