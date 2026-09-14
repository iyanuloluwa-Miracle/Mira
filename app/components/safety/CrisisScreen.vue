<script setup lang="ts">
// [FR6][R2][R3][NFR5] The static crisis pathway's on-screen content — pre-written, reviewed
// copy from app/content/copy/postScreening.ts and helpline contacts from config/helplines.ts,
// both imported directly rather than fetched. Nothing on this screen is generated text and
// nothing here waits on a network call, so it can render the instant a CRISIS result is known
// (see app/pages/result/[sessionId].vue) with no loading state. Reused as-is by
// app/pages/support/crisis.vue, which is reachable with no session at all.
//
// Deliberately shows no scores, bands, or percentages — someone reading this may be in acute
// distress, and a number here would not help.
import {
  CRISIS_BODY_LINES,
  CRISIS_CONTINUE_LABEL,
  CRISIS_ENCOURAGEMENT,
  CRISIS_HEADLINE,
  CRISIS_HELPLINES_HEADING,
  CRISIS_HELPLINES_UNVERIFIED_NOTICE,
  CRISIS_IMMEDIATE_DANGER
} from '~/content/copy/postScreening'
import { HELPLINES } from '~~/config/helplines'

withDefaults(defineProps<{ showContinueLink?: boolean }>(), { showContinueLink: true })

const hasUnverified = HELPLINES.some((h) => !h.verified)
</script>

<template>
  <div class="crisis">
    <header class="crisis__hero">
      <h1 class="crisis__title">{{ CRISIS_HEADLINE }}</h1>
      <div class="crisis__body">
        <p v-for="line in CRISIS_BODY_LINES" :key="line">{{ line }}</p>
      </div>
    </header>

    <aside class="crisis__urgent" role="note">
      <p class="crisis__urgent-line">{{ CRISIS_ENCOURAGEMENT }}</p>
      <p class="crisis__urgent-line">{{ CRISIS_IMMEDIATE_DANGER }}</p>
    </aside>

    <section aria-labelledby="crisis-helplines-heading" class="crisis__contacts">
      <h2 id="crisis-helplines-heading" class="crisis__contacts-title">
        {{ CRISIS_HELPLINES_HEADING }}
      </h2>

      <p v-if="hasUnverified" class="crisis__notice">
        {{ CRISIS_HELPLINES_UNVERIFIED_NOTICE }}
      </p>

      <ul class="crisis__list">
        <li v-for="helpline in HELPLINES" :key="helpline.name" class="crisis__card">
          <div class="crisis__card-copy">
            <p class="crisis__card-name">{{ helpline.name }}</p>
            <p class="crisis__card-meta">{{ helpline.availability }}</p>
            <p v-if="helpline.description" class="crisis__card-desc">{{ helpline.description }}</p>
          </div>
          <a :href="`tel:${helpline.phone}`" class="crisis__call">
            <span class="crisis__call-label">Call</span>
            <span class="crisis__call-number">{{ helpline.phone }}</span>
          </a>
        </li>
      </ul>
    </section>

    <NuxtLink v-if="showContinueLink" to="/" class="crisis__continue">
      {{ CRISIS_CONTINUE_LABEL }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.crisis {
  --crisis-ink: #122421;
  --crisis-muted: #3a4f4c;
  --crisis-accent: #0f6f64;
  --crisis-accent-deep: #0b574e;

  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  color: var(--crisis-ink);
}

.crisis__hero {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: crisis-rise 0.55s ease-out both;
}

.crisis__title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', ui-serif, serif;
  font-size: clamp(2.35rem, 9vw, 3.25rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--crisis-ink);
}

.crisis__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 1.0625rem;
  line-height: 1.55;
  color: var(--crisis-muted);
}

.crisis__body p {
  margin: 0;
}

.crisis__urgent {
  padding: 1rem 0 1rem 1rem;
  border-left: 3px solid var(--crisis-accent);
  background: linear-gradient(90deg, rgba(15, 111, 100, 0.1) 0%, rgba(15, 111, 100, 0.02) 100%);
  animation: crisis-rise 0.55s ease-out 0.06s both;
}

.crisis__urgent-line {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--crisis-ink);
}

.crisis__urgent-line + .crisis__urgent-line {
  margin-top: 0.65rem;
}

.crisis__contacts {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  animation: crisis-rise 0.55s ease-out 0.12s both;
}

.crisis__contacts-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--crisis-ink);
}

.crisis__notice {
  margin: 0;
  padding: 0.75rem 0.9rem;
  border-left: 3px solid #8a6a1f;
  background: rgba(15, 111, 100, 0.06);
  font-size: 0.875rem;
  line-height: 1.45;
  color: #4a3b14;
}

.crisis__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.crisis__card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(18, 60, 55, 0.16);
  border-radius: 0.85rem;
  background: rgba(18, 60, 55, 0.06);
}

.crisis__card-copy {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.crisis__card-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--crisis-ink);
}

.crisis__card-meta {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--crisis-accent);
}

.crisis__card-desc {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--crisis-muted);
}

.crisis__call {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-height: 52px;
  padding: 0.7rem 1rem;
  border-radius: 0.7rem;
  background: var(--crisis-accent);
  color: #f4fffc;
  text-decoration: none;
  transition:
    background-color 160ms ease,
    transform 160ms ease;
  box-shadow: 0 10px 24px rgba(15, 111, 100, 0.22);
}

.crisis__call:hover {
  background: var(--crisis-accent-deep);
  transform: translateY(-1px);
}

.crisis__call:active {
  transform: translateY(0);
}

.crisis__call-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.85;
}

.crisis__call-number {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.crisis__continue {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  margin-top: 0.25rem;
  border: 1px solid rgba(18, 60, 55, 0.2);
  border-radius: 0.7rem;
  background: rgba(18, 60, 55, 0.06);
  color: var(--crisis-ink);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
  animation: crisis-rise 0.55s ease-out 0.18s both;
}

.crisis__continue:hover {
  background: rgba(18, 60, 55, 0.12);
  border-color: rgba(18, 60, 55, 0.32);
}

@keyframes crisis-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .crisis__hero,
  .crisis__urgent,
  .crisis__contacts,
  .crisis__continue {
    animation: none !important;
  }

  .crisis__call {
    transition: none;
  }
}
</style>
