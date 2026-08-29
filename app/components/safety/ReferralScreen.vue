<script setup lang="ts">
// [FR6][NFR1] Shown on the result page for an escalate-worthy, non-CRISIS (i.e. HIGH) result —
// CRISIS keeps its own separate, unconditional SafetyCrisisScreen (rule R3) untouched by any of
// this. escalationRecorded (from the result payload) says whether HUMAN_REVIEW consent was
// already active at completion time; if not, this screen's own "share" action is the other
// place server/domain/consent.ts's consent-aware branch can flip to true, via
// POST /api/screening/[id]/escalate. Helplines are shown unconditionally either way — the
// consent gate only ever withholds the identifiable clinician-queue record, never this
// information itself.
import {
  REFERRAL_ALREADY_SHARED_BODY,
  REFERRAL_CLINICIAN_NOT_SEE_HEADING,
  REFERRAL_CLINICIAN_NOT_SEE_POINTS,
  REFERRAL_CLINICIAN_SEES_HEADING,
  REFERRAL_CLINICIAN_SEES_POINTS,
  REFERRAL_HEADING,
  REFERRAL_HELPLINES_HEADING,
  REFERRAL_HELPLINES_INTRO,
  REFERRAL_INTRO,
  REFERRAL_NOT_SHARED_BODY,
  REFERRAL_SHARE_BUTTON_LABEL,
  REFERRAL_SHARE_ERROR_MESSAGE,
  REFERRAL_SHARE_PENDING_LABEL,
  REFERRAL_SHARE_SUCCESS_MESSAGE,
  REFERRAL_WHAT_HAPPENS_NEXT_HEADING
} from '~/content/copy/escalation'
import { HELPLINES } from '~~/config/helplines'

const props = defineProps<{ sessionId: string; escalationRecorded: boolean }>()
const emit = defineEmits<{ shared: [] }>()

const shared = ref(props.escalationRecorded)
const sharing = ref(false)
const shareError = ref<string | null>(null)

async function handleShare(): Promise<void> {
  sharing.value = true
  shareError.value = null
  try {
    await $fetch(`/api/screening/${props.sessionId}/escalate`, { method: 'POST' })
    shared.value = true
    emit('shared')
  } catch {
    shareError.value = REFERRAL_SHARE_ERROR_MESSAGE
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-4">
    <div>
      <h2 class="text-lg font-semibold text-indigo-950">{{ REFERRAL_HEADING }}</h2>
      <p class="mt-1 text-sm text-indigo-900">{{ REFERRAL_INTRO }}</p>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-indigo-950">
        {{ REFERRAL_WHAT_HAPPENS_NEXT_HEADING }}
      </h3>
      <p class="mt-1 text-sm text-indigo-900">
        {{ shared ? REFERRAL_ALREADY_SHARED_BODY : REFERRAL_NOT_SHARED_BODY }}
      </p>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-indigo-950">{{ REFERRAL_CLINICIAN_SEES_HEADING }}</h3>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-indigo-900">
        <li v-for="point in REFERRAL_CLINICIAN_SEES_POINTS" :key="point">{{ point }}</li>
      </ul>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-indigo-950">
        {{ REFERRAL_CLINICIAN_NOT_SEE_HEADING }}
      </h3>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-indigo-900">
        <li v-for="point in REFERRAL_CLINICIAN_NOT_SEE_POINTS" :key="point">{{ point }}</li>
      </ul>
    </div>

    <p v-if="shareError" role="alert" class="text-sm text-red-700">{{ shareError }}</p>

    <button
      v-if="!shared"
      type="button"
      :disabled="sharing"
      class="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      @click="handleShare"
    >
      {{ sharing ? REFERRAL_SHARE_PENDING_LABEL : REFERRAL_SHARE_BUTTON_LABEL }}
    </button>
    <p v-else class="text-sm font-medium text-indigo-950">{{ REFERRAL_SHARE_SUCCESS_MESSAGE }}</p>

    <div class="border-t border-indigo-200 pt-4">
      <h3 class="text-sm font-semibold text-indigo-950">{{ REFERRAL_HELPLINES_HEADING }}</h3>
      <p class="mt-1 text-sm text-indigo-900">{{ REFERRAL_HELPLINES_INTRO }}</p>
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="helpline in HELPLINES"
          :key="helpline.name"
          class="rounded-lg border border-indigo-200 bg-white px-4 py-3"
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
      </div>
    </div>
  </section>
</template>
