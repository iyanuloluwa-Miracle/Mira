<script setup lang="ts">
// [FR1][R9] "Start a private check" needs no email or password — useScreeningSession().start()
// calls useAuth().ensureSession() first, which transparently creates an anonymous identity if
// the visitor doesn't have one yet. Registration is never on the path to screening.
const { start } = useScreeningSession()
const starting = ref(false)
const error = ref<string | null>(null)

async function handleStart() {
  starting.value = true
  error.value = null
  try {
    const sessionId = await start()
    await navigateTo(`/screen/${sessionId}`)
  } catch {
    error.value = "We couldn't start a session. Please try again."
    starting.value = false
    useEvaluation().logError()
  }
}
</script>

<template>
  <main class="landing">
    <!-- Full-bleed atmosphere. Inline SVG keeps this zero-request for low-data devices [NFR2]. -->
    <div class="landing__stage" aria-hidden="true">
      <div class="landing__glow landing__glow--a" />
      <div class="landing__glow landing__glow--b" />
      <div class="landing__grain" />

      <svg class="landing__art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stop-color="#e7f3f0" />
            <stop offset="28%" stop-color="#b5d4cf" />
            <stop offset="58%" stop-color="#5f9a93" />
            <stop offset="100%" stop-color="#2d5f5a" />
          </linearGradient>
          <radialGradient id="sun" cx="82%" cy="28%" r="36%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
            <stop offset="35%" stop-color="#d5ebe6" stop-opacity="0.55" />
            <stop offset="100%" stop-color="#d5ebe6" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4f8f87" />
            <stop offset="100%" stop-color="#1c4541" />
          </linearGradient>
        </defs>

        <rect width="1200" height="800" fill="url(#sky)" />
        <circle class="landing__sun" cx="980" cy="200" r="280" fill="url(#sun)" />

        <path
          fill="#4d877f"
          opacity="0.65"
          d="M0 340 C220 300 400 400 620 345 C860 285 1040 380 1200 330 L1200 520 L0 520 Z"
        />
        <path
          class="landing__wave landing__wave--far"
          fill="url(#water)"
          d="M0 390 C240 340 460 470 700 400 C940 330 1080 470 1200 410 L1200 800 L0 800 Z"
        />
        <path
          class="landing__wave landing__wave--near"
          fill="#143633"
          opacity="0.55"
          d="M0 490 C260 430 500 590 760 510 C1000 440 1120 575 1200 525 L1200 800 L0 800 Z"
        />
        <path
          class="landing__shimmer"
          fill="#eaf7f4"
          opacity="0.35"
          d="M0 430 C300 385 520 505 780 440 C1020 380 1120 470 1200 445 L1200 475 C1120 495 1020 420 780 470 C520 520 300 450 0 485 Z"
        />
      </svg>
    </div>

    <div class="landing__content">
      <header class="landing__brand">
        <h1 class="landing__title">PARS</h1>
        <p class="landing__lede">
          A private, few-minute check-in on how you've been feeling lately.
        </p>
      </header>

      <aside class="landing__note" role="note">
        <p class="landing__note-title">This is not a diagnosis.</p>
        <p class="landing__note-body">
          PARS is a screening tool, not a substitute for professional care. Only a qualified
          clinician can diagnose a mental health condition.
        </p>
      </aside>

      <div class="landing__actions">
        <button type="button" class="landing__cta" :disabled="starting" @click="handleStart">
          {{ starting ? 'Starting…' : 'Start a private check' }}
        </button>
        <p class="landing__hint">No account needed — you can register later.</p>
        <NuxtLink to="/login" class="landing__signin">Sign in</NuxtLink>
      </div>

      <p v-if="error" role="alert" class="landing__error">{{ error }}</p>
    </div>
  </main>
</template>

<style scoped>
.landing {
  --mira-ink: #122421;
  --mira-muted: #2f4541;
  --mira-accent: #0f6f64;
  --mira-accent-deep: #0b574e;

  position: relative;
  isolation: isolate;
  display: flex;
  min-height: 100svh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--mira-ink);
  background: #d7e8e4;
}

.landing__stage {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

.landing__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.landing__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  will-change: transform;
  z-index: 1;
}

.landing__glow--a {
  top: -4%;
  right: -10%;
  width: min(65vw, 460px);
  height: min(65vw, 460px);
  background: rgba(255, 255, 255, 0.7);
  animation: mira-drift 17s ease-in-out infinite alternate;
}

.landing__glow--b {
  top: 34%;
  left: -16%;
  width: min(75vw, 500px);
  height: min(50vw, 340px);
  background: rgba(110, 170, 162, 0.35);
  animation: mira-drift 22s ease-in-out infinite alternate-reverse;
}

.landing__grain {
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: 0.25;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
}

.landing__sun {
  animation: mira-breathe 11s ease-in-out infinite;
}

.landing__wave--far {
  animation: mira-wave 18s ease-in-out infinite alternate;
}

.landing__wave--near {
  animation: mira-wave 12s ease-in-out infinite alternate-reverse;
}

.landing__shimmer {
  animation: mira-shimmer 8s ease-in-out infinite;
}

.landing__content {
  position: relative;
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.35rem 1.5rem calc(1.4rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: linear-gradient(
    180deg,
    rgba(236, 245, 242, 0.35) 0%,
    rgba(236, 245, 242, 0.82) 22%,
    rgba(232, 242, 239, 0.94) 100%
  );
}

.landing__brand {
  animation: mira-rise 0.7s ease-out both;
}

.landing__title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', ui-serif, serif;
  font-size: clamp(3.5rem, 13vw, 4.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 0.92;
  color: var(--mira-ink);
}

.landing__lede {
  margin: 0.7rem 0 0;
  max-width: 22rem;
  font-size: 1.0625rem;
  line-height: 1.5;
  color: var(--mira-muted);
}

.landing__note {
  padding: 0.65rem 0 0.65rem 0.9rem;
  border-left: 3px solid var(--mira-accent);
  animation: mira-rise 0.7s ease-out 0.08s both;
}

.landing__note-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--mira-ink);
}

.landing__note-body {
  margin: 0.3rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--mira-muted);
}

.landing__actions {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  animation: mira-rise 0.7s ease-out 0.16s both;
}

.landing__cta {
  min-height: 48px;
  border: 0;
  border-radius: 0.7rem;
  padding: 0.85rem 1.35rem;
  background: var(--mira-accent);
  color: #f5fffc;
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    transform 160ms ease;
  box-shadow: 0 12px 28px rgba(15, 111, 100, 0.28);
}

.landing__cta:hover:not(:disabled) {
  background: var(--mira-accent-deep);
  transform: translateY(-1px);
}

.landing__cta:active:not(:disabled) {
  transform: translateY(0);
}

.landing__cta:disabled {
  opacity: 0.65;
  cursor: wait;
}

.landing__hint {
  margin: 0;
  text-align: center;
  font-size: 0.75rem;
  color: #2f4541;
}

.landing__signin {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 0.7rem;
  border: 1px solid rgba(18, 36, 33, 0.16);
  background: rgba(255, 255, 255, 0.55);
  color: var(--mira-ink);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.landing__signin:hover {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(18, 36, 33, 0.28);
}

.landing__error {
  margin: 0;
  font-size: 0.875rem;
  color: #9b1c1c;
}

@keyframes mira-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes mira-drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-14px, 18px, 0) scale(1.06);
  }
}

@keyframes mira-breathe {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes mira-wave {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-32px);
  }
}

@keyframes mira-shimmer {
  0%,
  100% {
    opacity: 0.18;
  }
  50% {
    opacity: 0.36;
  }
}

@media (min-width: 768px) {
  .landing__content {
    width: min(34rem, 90vw);
    max-width: 34rem;
    padding: 2.75rem 1.5rem;
    gap: 1.25rem;
  }

  .landing__title {
    font-size: 5.5rem;
  }

  .landing__lede {
    font-size: 1.1875rem;
    max-width: 26rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing__brand,
  .landing__note,
  .landing__actions,
  .landing__glow,
  .landing__sun,
  .landing__wave--far,
  .landing__wave--near,
  .landing__shimmer {
    animation: none !important;
  }

  .landing__cta {
    transition: none;
  }
}
</style>
