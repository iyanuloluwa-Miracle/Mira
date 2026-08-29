<script setup lang="ts">
// [Chapter Four, Section 3.8.3] A small, always-on-top control the researcher operates directly
// on the participant's screen during a moderated session (this app's usability-testing setup is
// one researcher and one participant sharing a browser — see app/composables/useEvaluation.ts's
// own comment) to mark task boundaries. Renders nothing at all unless an evaluation session is
// currently active, so it has zero footprint during ordinary use.
const { isActive, logEvent } = useEvaluation()

const taskId = ref('')
const taskRunning = ref(false)
const expanded = ref(false)

function startTask(): void {
  const id = taskId.value.trim()
  if (!id) return
  taskRunning.value = true
  void logEvent({ type: 'TASK_START', taskId: id })
}

function endTask(completed: boolean): void {
  const id = taskId.value.trim()
  if (!id) return
  taskRunning.value = false
  void logEvent({ type: 'TASK_END', taskId: id, completed })
}
</script>

<template>
  <div
    v-if="isActive"
    class="fixed bottom-4 left-4 z-50 rounded-lg border border-amber-400 bg-amber-50 text-xs text-amber-950 shadow-lg"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 font-semibold"
      @click="expanded = !expanded"
    >
      <span class="inline-block h-2 w-2 rounded-full bg-amber-600" />
      Evaluation active
    </button>

    <div v-if="expanded" class="flex flex-col gap-2 border-t border-amber-300 px-3 py-3">
      <label class="flex flex-col gap-1">
        <span>Task id</span>
        <input
          v-model="taskId"
          type="text"
          :disabled="taskRunning"
          class="min-h-[32px] rounded border border-amber-400 bg-white px-2 py-1 text-slate-900"
        />
      </label>
      <button
        v-if="!taskRunning"
        type="button"
        class="min-h-[32px] rounded bg-amber-600 px-2 py-1 font-semibold text-white disabled:opacity-40"
        :disabled="!taskId.trim()"
        @click="startTask"
      >
        Start task
      </button>
      <div v-else class="flex gap-2">
        <button
          type="button"
          class="min-h-[32px] flex-1 rounded bg-emerald-700 px-2 py-1 font-semibold text-white"
          @click="endTask(true)"
        >
          End — success
        </button>
        <button
          type="button"
          class="min-h-[32px] flex-1 rounded bg-red-700 px-2 py-1 font-semibold text-white"
          @click="endTask(false)"
        >
          End — failed
        </button>
      </div>
    </div>
  </div>
</template>
