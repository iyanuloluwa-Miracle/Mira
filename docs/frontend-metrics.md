# Frontend metrics (prompt 8 — screening UI)

Measured against the production build (`npm run build && node .output/server/index.mjs`),
not the dev server, since dev-mode HMR client code inflates payload size and disables the
optimizations these numbers are meant to verify.

## NFR2 — initial JS/CSS payload (target: < 200KB gzipped)

Measured by requesting `/` from the built server, extracting every referenced `_nuxt/*.js`
and `_nuxt/*.css` file, and gzipping each directly:

| Asset type | Gzipped size |
| ---------- | ------------ |
| JS         | ~77.4 KB     |
| CSS        | ~3.6 KB      |
| **Total**  | **~81 KB**   |

Well under the 200KB budget, with room to spare before this needs revisiting. The largest
contributor is Vue + Nuxt's client runtime itself, not application code — dropping `@nuxt/fonts`
(see below) was the only meaningful lever available at this stage.

## Lighthouse — mobile, 360×740, simulated throttling

Run via `npx lighthouse http://localhost:PORT/ --form-factor=mobile
--screenEmulation.width=360 --screenEmulation.height=740 --throttling-method=simulate` against
the landing page (`/`). `throttling-method=simulate` applies Lighthouse's default mobile
profile (~slow 4G, 4x CPU slowdown) — deliberately, since that profile is a closer match to
this app's actual target device class (NFR2: cheap Android hardware, expensive/unreliable
data) than an unthrottled desktop-class run would be. Full reports:
[landing.report.html](lighthouse/landing.report.html) / [landing.report.json](lighthouse/landing.report.json).

| Category      | Score |
| ------------- | ----- |
| Performance   | 82    |
| Accessibility | 100   |

| Metric                   | Value  |
| ------------------------ | ------ |
| First Contentful Paint   | 2.3 s  |
| Largest Contentful Paint | 2.3 s  |
| Speed Index              | 2.3 s  |
| Total Blocking Time      | 540 ms |
| Cumulative Layout Shift  | 0      |
| Time to Interactive      | 3.0 s  |

The FCP/LCP/TTI figures reflect the throttling profile, not the payload size — under it, most
of the elapsed time is simulated network RTT and 4x-slowed JS parse/hydrate, not anything the
81KB payload itself is doing. `mainthread-work-breakdown` attributes ~1s of that to
unattributable browser-internal work and ~0.7s to evaluating the page's own script, consistent
with Vue hydration cost rather than a specific slow module.

Accessibility reached 100 after two fixes surfaced by the first run: a missing `<html lang>`
attribute and a missing document `<title>`, both added via `app.head` in `nuxt.config.ts`.

## Accessibility — contrast (target: 4.5:1)

Computed directly from the Tailwind color values in use (WCAG relative-luminance formula),
covering every foreground/background text pairing in the screening UI:

| Pair                                               | Ratio   | Result |
| -------------------------------------------------- | ------- | ------ |
| `indigo-600` button text on white                  | 6.29:1  | Pass   |
| `red-700` safety-exit button text on white         | 6.47:1  | Pass   |
| `amber-900` disclaimer text on `amber-50`          | 8.75:1  | Pass   |
| `slate-900` body text on white                     | 17.85:1 | Pass   |
| `slate-700` body text on white                     | 10.35:1 | Pass   |
| `slate-600` loading text on white                  | 7.58:1  | Pass   |
| `red-700` inline error text on white               | 6.47:1  | Pass   |
| `indigo-700` link text on white                    | 7.90:1  | Pass   |
| `indigo-600` selected-answer border on `indigo-50` | 5.62:1  | Pass   |

All pairs clear the 4.5:1 minimum with margin.

## E2E coverage — full screening flow at 360px (`tests/e2e/screening.spec.ts`)

12/12 passing (`mobile-360` and `desktop` Playwright projects): landing-page disclaimer above
the fold, full PHQ-9 + GAD-7 completion reaching a MINIMAL result, Next disabled until answered,
Back preserving a prior answer, the safety-exit button reaching the crisis page, and the crisis
page being reachable directly with no session at all.

One infrastructure note from getting this suite green: the dev/test database is remote (Neon
serverless Postgres), whose compute auto-suspends when idle and takes 2-3s to resume on the
first query after a gap, plus real cross-region round-trip latency on every query after that —
confirmed by timing raw queries directly (~2.6s cold, ~275ms warm). `playwright.config.ts`'s
global assertion timeout is set to 15s to accommodate this; it does not change the app's own
NFR3 latency budget (`serverLatencyMs`, measured in
`server/api/screening/[id]/complete.post.ts`).

## What NFR2's other requirements looked like in practice

- **No web fonts over 100KB**: removed `@nuxt/fonts` entirely in favor of a system font stack
  (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`) — 0 bytes,
  0 requests, and no flash of unstyled text to guard against.
- **Cached instrument fetching**: `useScreeningSession().start()` fetches the item list once and
  holds it in reactive state for the session's lifetime; nothing re-fetches it per question.
- **Optimistic, offline-tolerant answering**: selecting an answer updates local state and
  `localStorage` synchronously; the network sync happens in the background and is retried on
  `online`, so a slow or dropped connection never blocks moving to the next question.
- **Graceful degradation**: the safety-exit button is a real `<NuxtLink>`, not a click handler —
  it works with no JavaScript at all.
