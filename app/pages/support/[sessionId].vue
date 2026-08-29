<script setup lang="ts">
// [FR3][R3][R6][R7][NFR2] The bounded conversational layer's one screen. Talks only to
// POST /api/conversation/[sessionId]/message (server/api/conversation/[sessionId]/message.post.ts),
// which returns one JSON object per turn, never a token stream (see
// server/services/conversation/orchestrate.ts) — the "typing" indicator below is an honest
// thinking/waiting state for that single round trip, not a fake reveal of an already-complete
// reply.
//
// Conversation continuity is entirely client-side: this page holds the whole transcript in
// memory and resends its own already-approved messages as priorMessages on every turn (capped
// at MAX_PRIOR_MESSAGES, matching the server's own zod max) — the server never stores or
// reconstructs a transcript unless the person has separately consented to research logging
// (rule R5). Refreshing this page loses the on-screen conversation; that is the intended
// behaviour, not a bug.
//
// A 'crisis' outcome (server-side pre-filter, rule R6) replaces this entire screen with
// SafetyCrisisScreen — the same static, pre-written component the result page uses for a
// CRISIS band — rather than rendering the API's own crisis payload as a chat bubble. Nothing
// about the crisis pathway is ever generated text, even the copy that names it (rule R3).
//
// No list-virtualisation library: MAX_PRIOR_MESSAGES plus the server's own per-session token
// ceiling (server/services/conversation/orchestrate.ts) already bound how long this list can
// get to a couple dozen short bubbles at most, so a virtualisation dependency would be solving
// a problem this page cannot actually have. Each bubble instead gets content-visibility: auto,
// a dependency-free way to keep scroll/render cost flat on a cheap Android device as the list
// grows within that bound.
import {
  CHAT_BACK_TO_RESULT_LABEL,
  CHAT_EMPTY_STATE_INTRO,
  CHAT_HEADER_DISCLAIMER,
  CHAT_HEADER_TITLE,
  CHAT_INPUT_PLACEHOLDER,
  CHAT_NETWORK_ERROR_MESSAGE,
  CHAT_SEND_BUTTON_LABEL,
  CHAT_SUGGESTED_PROMPTS
} from '~/content/copy/conversation'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type ConversationApiResponse =
  | { kind: 'crisis'; serverTimeMs: number }
  | {
      kind: 'ok' | 'session-limit' | 'llm-unavailable' | 'post-filter'
      text: string
      serverTimeMs: number
    }

// Matches priorMessageSchema's array max in message.post.ts — kept here too so a long
// conversation degrades to "only the most recent context" instead of every send failing 400.
const MAX_PRIOR_MESSAGES = 20

const route = useRoute()
const sessionId = route.params.sessionId as string

const { state } = useScreeningSession()
const { logError } = useEvaluation()

const ready = ref(state.value.sessionId === sessionId && !!state.value.result)
const loadError = ref<string | null>(null)

onMounted(async () => {
  if (ready.value) return
  try {
    await $fetch(`/api/screening/${sessionId}/result`)
    ready.value = true
  } catch {
    loadError.value = "We couldn't find that screening result."
    logError()
  }
})

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const sending = ref(false)
const sendError = ref<string | null>(null)
const sessionLimitReached = ref(false)
const crisisTriggered = ref(false)
const listEl = ref<HTMLElement | null>(null)

const canSend = computed(
  () =>
    draft.value.trim().length > 0 &&
    !sending.value &&
    !sessionLimitReached.value &&
    !crisisTriggered.value
)

async function scrollToBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function sendMessage(rawText: string) {
  const text = rawText.trim()
  if (!text || sending.value || sessionLimitReached.value || crisisTriggered.value) return

  const priorMessages = messages.value
    .slice(-MAX_PRIOR_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))

  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  sendError.value = null
  sending.value = true
  await scrollToBottom()

  try {
    const response = (await $fetch(`/api/conversation/${sessionId}/message`, {
      method: 'POST',
      body: { message: text, priorMessages }
    })) as unknown as ConversationApiResponse

    if (response.kind === 'crisis') {
      crisisTriggered.value = true
      return
    }

    messages.value.push({ role: 'assistant', content: response.text })
    if (response.kind === 'session-limit') sessionLimitReached.value = true
  } catch {
    // The optimistic bubble never got a reply — hand the text back to the input rather than
    // leaving an ambiguous, unanswered bubble on screen.
    messages.value.pop()
    draft.value = text
    sendError.value = CHAT_NETWORK_ERROR_MESSAGE
    logError()
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

function handleSubmit() {
  if (!canSend.value) return
  sendMessage(draft.value)
}

function handleEnterKey(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  handleSubmit()
}

useHead({ title: CHAT_HEADER_TITLE })
</script>

<template>
  <!-- h-dvh (dynamic viewport height), not the min-h-svh used elsewhere in this app: this is
       the one screen with a fixed input bar that must stay clear of an on-screen keyboard, and
       dvh is the unit that actually shrinks with the visual viewport when a keyboard opens on
       Android Chrome, where min-h-svh would not. -->
  <main class="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-white">
    <header class="shrink-0 border-b border-slate-200 px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-base font-semibold text-slate-900">{{ CHAT_HEADER_TITLE }}</h1>
        <NuxtLink
          to="/support/crisis"
          prefetch
          class="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-red-700 px-3 py-2 text-xs font-semibold whitespace-nowrap text-white shadow hover:bg-red-800"
        >
          <span aria-hidden="true">⚠</span>
          <span>I need help now</span>
        </NuxtLink>
      </div>
      <p class="mt-1 text-xs text-slate-600">{{ CHAT_HEADER_DISCLAIMER }}</p>
    </header>

    <div v-if="loadError" class="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <p class="text-base text-slate-900">{{ loadError }}</p>
        <NuxtLink to="/" class="mt-4 inline-block text-indigo-700 underline">Back to Mira</NuxtLink>
      </div>
    </div>

    <div v-else-if="!ready" class="flex flex-1 items-center justify-center px-6 text-center">
      <p class="text-base text-slate-600">Loading…</p>
    </div>

    <div v-else-if="crisisTriggered" class="flex-1 overflow-y-auto px-6 py-6">
      <SafetyCrisisScreen />
    </div>

    <template v-else>
      <div ref="listEl" class="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <div v-if="messages.length === 0" class="flex h-full flex-col justify-end gap-4">
          <p class="text-sm text-slate-600">{{ CHAT_EMPTY_STATE_INTRO }}</p>
          <div class="flex flex-col gap-2">
            <button
              v-for="prompt in CHAT_SUGGESTED_PROMPTS"
              :key="prompt"
              type="button"
              class="min-h-[44px] rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
              @click="sendMessage(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </div>

        <div v-else class="flex flex-col gap-3">
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="flex [content-visibility:auto] [contain-intrinsic-size:auto_64px]"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <p
              class="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
              :class="
                message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'
              "
            >
              {{ message.content }}
            </p>
          </div>

          <div v-if="sending" class="flex justify-start">
            <div
              class="flex items-center gap-1 rounded-lg bg-slate-100 px-4 py-3"
              aria-label="Assistant is typing"
            >
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
                style="animation-delay: 0ms"
              />
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
                style="animation-delay: 150ms"
              />
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
                style="animation-delay: 300ms"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="sendError" class="shrink-0 border-t border-amber-300 bg-amber-50 px-4 py-3">
        <p role="alert" class="text-sm text-amber-900">{{ sendError }}</p>
        <NuxtLink
          :to="`/result/${sessionId}`"
          class="mt-1 inline-block text-sm font-semibold text-indigo-700 underline"
        >
          {{ CHAT_BACK_TO_RESULT_LABEL }}
        </NuxtLink>
      </div>

      <footer class="shrink-0 border-t border-slate-200 px-4 py-3">
        <form class="flex items-end gap-2" @submit.prevent="handleSubmit">
          <textarea
            v-model="draft"
            :disabled="sending || sessionLimitReached"
            rows="1"
            maxlength="2000"
            :placeholder="CHAT_INPUT_PLACEHOLDER"
            class="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-slate-300 px-4 py-3 text-base disabled:opacity-60"
            @keydown.enter.exact="handleEnterKey"
          />
          <button
            type="submit"
            :disabled="!canSend"
            class="min-h-[44px] shrink-0 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {{ CHAT_SEND_BUTTON_LABEL }}
          </button>
        </form>
        <p v-if="sessionLimitReached" class="mt-2 text-xs text-slate-600">
          <NuxtLink :to="`/result/${sessionId}`" class="font-semibold text-indigo-700 underline">
            {{ CHAT_BACK_TO_RESULT_LABEL }}
          </NuxtLink>
        </p>
      </footer>
    </template>
  </main>
</template>
