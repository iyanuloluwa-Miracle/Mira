# Security controls

Documents the technical security controls in this codebase: what they are, why they exist, and
how each is tested. Companion to [privacy-controls.md](privacy-controls.md) (data-protection
controls specifically) and [ndpa-mapping.md](ndpa-mapping.md) (the legal mapping). See
[SECURITY.md](../SECURITY.md) for how to report a vulnerability.

The [threat model](#threat-model) section is the one worth reading first — it is written against
the threats this specific system actually faces, not a generic checklist, and every control below
exists because of a specific line in it.

## Threat model

Six scenarios, each concrete to this system: a screening tool a person may use while distressed,
reachable anonymously, with an optional free-text field and a bounded chat layer, and a separate
clinician realm that can see risk-level detail and sometimes free text.

### 1. Another person picks up the user's phone

The single most realistic threat for this app's actual audience — a shared family phone, a
borrowed device, someone glancing over a shoulder — more likely in practice than a remote network
attacker.

**Controls:**

- Anonymous-first design (rule R9): by default there is no name or email tied to the account at
  all, only a pseudonym (`server/utils/privacy.ts`'s `generatePseudonym`) — someone who picks up
  the phone sees "quiet-harbour-41", not a name.
- The session cookie is `httpOnly` (`server/utils/auth.ts`), so it can't be read or exfiltrated
  by injected script even in combination with another bug.
- Session lifetime is bounded two ways, not just one: the existing sliding 30-day window
  (`SESSION_TTL_MS`) and, new here, a 90-day absolute ceiling (`SESSION_ABSOLUTE_TTL_MS`,
  `server/middleware/auth.ts`) — a session in continuous use is still forced to re-authenticate
  eventually, closing the "this cookie is good forever as long as someone keeps using it" gap a
  pure idle timeout leaves open.
- The crisis page (`/support/crisis`, rule R3) is reachable with no session and no loading state
  from every screen, so a person in the middle of something sensitive can always redirect
  attention to something clinically safe fast — the `SafetyExitButton` component. **This is a
  crisis-access button, not a privacy quick-exit** — see residual risk below; do not conflate it
  with a "leave this page and hide it" pattern.
- Deleting a single screening session (`server/api/screening/[id].delete.ts`) or the whole
  account (`server/api/privacy/delete-account.post.ts`, [privacy-controls.md](privacy-controls.md))
  needs no re-authentication step beyond the existing cookie, so a person who realises they're
  about to be interrupted can erase quickly.

**Residual risk:** there is no PIN, biometric re-lock, or auto-logout on the app losing focus —
anyone with the unlocked phone and an active session sees everything that session can see,
including past screening history (`server/api/screening/history.get.ts`) with no fresh
authentication challenge. There is no "quick exit" pattern (common on domestic-violence support
sites: a button that instantly navigates away to something innocuous and scrubs recent history) —
`SafetyExitButton` solves a different problem (reaching crisis help fast) and should not be
mistaken for one. 30 days is still a long time for a shared or borrowed device to stay
authenticated. None of this is addressed by anything in this PR; it would need product-level
design work (an app PIN, a "not my device" mode, a real quick-exit affordance), not just a
server-side control.

### 2. Network observation

An attacker positioned on the network path — public wifi, a compromised router, an ISP — reading
or tampering with traffic.

**Controls:**

- HSTS (`server/plugins/security-headers.ts`), `max-age=63072000; includeSubDomains; preload` —
  once a browser has seen this header once over a real HTTPS connection, it refuses to downgrade
  to plain HTTP for two years, closing the classic SSL-stripping attack for returning visits.
- Every cookie this app sets (`mira_session`, `mira_clinician_session`, `mira_csrf`) is `Secure`
  in production (`process.env.NODE_ENV === 'production'`) — never sent over a plain-HTTP
  connection — and `SameSite=Lax`.
- No sensitive data ever travels in a URL: every mutating endpoint is POST/PATCH/DELETE with a
  JSON body, never a query string (enforced now across the board — see [Input
  validation](#input-validation-rule-r8)).
- `Cross-Origin-Resource-Policy: same-origin` and `Cross-Origin-Opener-Policy: same-origin`
  (`server/plugins/security-headers.ts`) reduce what a malicious page loaded alongside this one
  (e.g. via a compromised ad network on the same network path) can read via browser-level
  side channels.

**Residual risk:** HSTS has an unavoidable trust-on-first-visit gap — the very first request to a
domain that has never set the header can still be intercepted before the browser has anything to
enforce; HSTS preloading (submitting the domain to browsers' built-in preload lists) closes that
gap but requires an actual production domain and hasn't been done for this thesis prototype.
Whether TLS is actually terminated correctly (certificate validity, cipher suite choice) is a
deployment-infrastructure concern, not something in this codebase to control.

### 3. Database compromise

An attacker who obtains a copy of the database — a leaked backup, a compromised hosting account,
an over-privileged query.

**Controls:**

- Free text, conversation transcripts, and clinician notes are AES-256-GCM encrypted
  (`server/utils/crypto.ts`) before they reach a query — a raw dump of these columns is
  ciphertext, not readable content.
- Emails are never stored in plaintext: `emailHash` (a keyed HMAC-SHA256, `server/utils/
privacy.ts`) is what login actually looks up by, and the separately-encrypted `emailCiphertext`
  is only ever decrypted server-side for delivery.
- Passwords are argon2id hashed, never reversible.
- Session and clinician-session tokens are stored as an HMAC hash of the raw token
  (`hashSessionToken`, `server/utils/auth.ts`) — the raw token that actually authenticates a
  request is never persisted anywhere; a database dump alone cannot be used to forge a session.
- Three independent secrets — `ENCRYPTION_KEY`, `IDENTIFIER_HASH_PEPPER`, `AUTH_SECRET` — so a
  leak of one (e.g. the encryption key, via a misconfigured backup) does not also compromise
  identifier hashing or session-token verification.
- The app refuses to boot without valid key material (`server/plugins/verify-encryption-key.ts`)
  — there is no accidental "encryption silently disabled" state.

**Residual risk:** this protects the _content_ of free text and identifiers, not the _shape_ of
the data — PHQ-9/GAD-7 item answers, computed scores, and risk bands are stored as plain integers
and enum values, not encrypted, so a database compromise still reveals, for every pseudonym, their
screening history and risk levels (just not what they wrote in their own words, and not who they
are). If the database and the application's secrets are compromised together (plausible if both
live in the same cloud account), encryption at rest provides no protection at all — key
separation only helps when the compromises are partial. This codebase has no key-rotation
mechanism, and backup security is entirely a deployment concern outside its scope.

### 4. A malicious or compromised clinician account

An attacker who obtains valid clinician credentials, or an insider clinician account misused
beyond its legitimate purpose.

**Controls:**

- The clinician realm is a structurally separate auth system end to end
  (`Clinician`/`ClinicianSession`, `mira_clinician_session` cookie, `server/utils/
clinician-auth.ts`'s `requireClinician`/`requireAdmin`) — never the same session type or table
  as the person-being-screened realm, enforced by convention and reviewed in every PR
  ([CONTRIBUTING.md](../CONTRIBUTING.md)).
- A clinician never sees a userId or an email — only a pseudonym, risk level, scores, and
  rationale (tested: `tests/integration/clinician.test.ts`'s "never includes userId, email...").
- Free-text visibility is consent-gated _at read time_, not just at the moment the Escalation row
  was created: `canRevealFreeTextToClinician` (`server/domain/consent.ts`) is re-checked on every
  view, so withdrawing `HUMAN_REVIEW` consent immediately stops a clinician seeing it, even for a
  case still open in the queue.
- Every status change and every notes update is audited with the acting clinician's id
  (`server/utils/audit.ts`, `ESCALATION_STATUS_CHANGED`/`ESCALATION_NOTE_UPDATED`) — a compromised
  account's actions leave a trail.
- Role separation: only `ADMIN` clinicians can manage the resource library
  (`requireAdmin`), not every clinician account.
- A shorter, more tightly bounded session than the person-being-screened realm: 12-hour sliding
  window, 7-day absolute ceiling (`CLINICIAN_SESSION_TTL_MS`,
  `CLINICIAN_SESSION_ABSOLUTE_TTL_MS`) — reflecting this realm's larger blast radius per
  compromised credential.
- The clinician login endpoint has its own rate-limit budget, not shared with the
  person-being-screened realm (`clinicianAuthRateLimiter`), and (new here) pays the same argon2
  cost whether or not the email matches a real account — see [Enumeration](#6-enumeration-of-accounts-through-the-auth-endpoints).

**Residual risk:** a valid (stolen or misused) clinician session can still see everything a
legitimate clinician session can — risk level, scores, rationale, and free text for any case with
currently-active consent. There is no anomaly detection or access-rate alerting (nothing flags "this
clinician viewed far more cases today than their caseload would explain"). Clinician notes are
encrypted at rest but are readable by **any** authenticated clinician who opens that escalation,
not scoped to whoever is assigned to it — there is no assignment/ownership model for a case at
all yet. There is no two-person approval for any clinician action. Audit rows are written but
nothing currently _reviews_ them — the accountability trail exists, but no dashboard or alerting
consumes it.

### 5. Prompt injection through free text

Free text a person writes reaches two different destinations, with two different risk profiles:
the classifier (`services/classifier/`, a small fine-tuned model, supplementary signal only —
rule R1) and, if the person continues into the bounded conversational layer, their own typed
messages reach a real generative LLM (`server/services/conversation/`).

**Controls:**

- **The free-text submission itself never reaches the LLM.** `server/api/screening/[id]/
text.post.ts` sends it only to the classifier. What the conversation endpoint receives is a
  fresh, separate `message` field the person types into the chat — it is not the screening
  free-text field being replayed into an LLM prompt.
- The system prompt (`server/services/conversation/system-prompt.ts`) is entirely server-defined
  and passed as the system role; user input is always a separate user-turn message, not
  concatenated into instructions — the structural separation a well-formed chat API gives you for
  free, not a strong defense on its own, but a real one.
- **Output, not input, is where the actual enforcement lives (rule R6).** The pre-filter
  (`server/domain/conversation-safety.ts`) short-circuits before the LLM is ever called for
  self-harm content, returning static crisis copy instead (rule R3). The post-filter checks the
  LLM's _response_ against a deterministic pattern list — diagnosis claims, medication/dosage
  information, claiming to be a clinician — and substitutes a fixed fallback if it matches,
  regardless of what prompt or injection produced that output. This is the architecturally
  important point: rather than trying to reliably _prevent_ injection (an unsolved problem for
  generative models generally), the system bounds the _consequence_ of a successful one.
  `docs/llm-safety-tests.md` documents the adversarial test suite proving this.
- Every pre-filter and post-filter trigger is audited with the reason, never the triggering text
  (`CONVERSATION_PRE_FILTER_TRIGGERED`/`CONVERSATION_POST_FILTER_TRIGGERED`).
- (New here) A strict rate limit specifically on this endpoint (`conversationRateLimiter`, 10 per
  minute per hashed IP) — every call that gets past the pre-filter is a real, billed call to the
  LLM provider, the most expensive request this app makes.

**Residual risk:** the post-filter is a deterministic pattern/keyword list, not a semantic
understanding of the response — a sufficiently novel phrasing that says something the filter's
authors didn't anticipate (a subtly harmful claim that doesn't match any listed pattern) could
still reach the person. There is no defense specifically against prompt extraction (getting the
model to reveal its system prompt) — low severity here, since the system prompt contains
behavioural instructions, not secrets, but it is not explicitly blocked by anything in this
codebase. The pre-filter only inspects the person's own message for self-harm signal; it does not
re-run against the LLM's output, which is exactly why the post-filter exists as the real backstop
for anything the pre-filter didn't catch on the way in.

### 6. Enumeration of accounts through the auth endpoints

An attacker probing `/api/auth/*` to determine which email addresses have registered accounts —
itself a privacy leak for a mental-health app, independent of any subsequent credential attack.

**Controls:**

- `login.post.ts` and `clinician/login.post.ts` return the identical status and message whether
  the email doesn't exist or the password is wrong (tested:
  `tests/integration/auth.test.ts`'s "rejects a wrong password with a generic, non-enumerating
  error").
- **(New here) That parity now holds under timing, not just under the response body.** Before
  this PR, an unknown email returned near-instantly (no account found, no password check run) while
  a known email with the wrong password took the ~100ms+ argon2id verification actually costs —
  an attacker measuring response time alone could distinguish the two even though the bodies were
  identical. `getDummyPasswordHash()` (`server/utils/auth.ts`) precomputes a real, valid-format
  argon2id hash with no corresponding password; both login routes now run a real `verifyPassword`
  call against it whenever no account matches, so the computational cost — and therefore the
  response time — no longer depends on whether the email is registered.
- Both auth realms are rate-limited per hashed IP (`authRateLimiter`,
  `clinicianAuthRateLimiter`, 10 attempts / 15 minutes) — hashed, so the raw IP itself is never
  persisted (`hashIdentifier`).
- CSRF protection (below) applies to these endpoints too, including login — closing
  login-CSRF (forcing a victim's browser into an attacker-controlled account), a related but
  distinct enumeration-adjacent risk.

**Residual risk:** `register.post.ts` necessarily returns 409 for a duplicate email — there is no
way to offer "this email is already taken" feedback during registration without that being, in
itself, an enumeration channel. This is a deliberate, common UX/privacy tradeoff, named here
rather than silently present. Rate limiting is per-IP; a distributed attempt from many addresses
is not meaningfully slowed by either limiter. `claim-account.post.ts` (upgrading an anonymous
session to registered) has the identical 409-on-duplicate behavior for the same reason.

## Headers and Content Security Policy

`server/plugins/security-headers.ts`, applied to every response — API and page — via Nitro's
`request`/`render:html`/`beforeResponse` hooks (not `render:response`, which only fires for
full-page SSR renders and never for `/api/*` JSON responses).

| Header                         | Value                                                                                                                                                                                                                | Purpose                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'self'; script-src 'self' 'nonce-<per-request>'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` | No `'unsafe-inline'` anywhere, in either directive.                                                              |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload`                                                                                                                                                                       | Forces HTTPS for two years once seen.                                                                            |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                            | Stops MIME-sniffing turning a non-script response into an executed one.                                          |
| `Referrer-Policy`              | `no-referrer`                                                                                                                                                                                                        | No URL (which can carry a session-adjacent path) ever leaks to a destination site via the Referer header.        |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                           | This app has no legitimate use for any of the three; denied outright rather than left to default.                |
| `X-Frame-Options`              | `DENY`                                                                                                                                                                                                               | Beyond the brief's list — the pre-CSP clickjacking defense, for a browser that doesn't honour `frame-ancestors`. |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                                                                                                                        | Beyond the brief's list — isolates this app's browsing context group.                                            |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                        | Beyond the brief's list — blocks another origin from `<script>`/`<img>`-loading this app's responses cross-site. |

**No `'unsafe-inline'`, achieved without breaking the app, not by leaving something out:**

- `script-src` needs a nonce because Nuxt's own SSR renderer emits two inline `<script>` tags
  outside of app code — the import map and the `window.__NUXT__` hydration payload. Nuxt has no
  built-in nonce support outside its experimental SSR-streaming renderer (which this app doesn't
  use), so the `render:html` hook regex-injects the per-request nonce into every `<script` tag
  that doesn't already carry one, after Nuxt has finished producing the HTML string but before it
  is sent.
- `style-src` needed no exception at all: this app has zero inline `<style>` tags and, as of this
  PR, zero `style="..."` attributes anywhere in its own markup either.
  `app/components/screening/ProgressBar.vue` was the one place that used a `:style` binding for a
  dynamic width — it now selects from a literal, closed set of Tailwind arbitrary-value classes
  (`WIDTH_CLASSES`, rounded to the nearest 5%) instead, so `style-src 'self'` holds with nothing
  carved out.

**Injecting the CSRF bootstrap script had to solve the same nonce problem a different way** — see
[CSRF protection](#csrf-protection) below; the short version is that a normal Nuxt plugin runs too
late to patch `window.fetch` before Nuxt's own entry chunk captures a reference to it, so that
script is itself injected via `useHead` ahead of Nuxt's entry `<script type="module">` tag, and
gets nonced by the same mechanism as everything else.

Verified: `tests/integration/error-handling.test.ts` asserts the full header set on both an API
response and a page response, and that every inline `<script>` on the page carries the same nonce
the CSP header names.

## CSRF protection

Double-submit cookie, `server/utils/csrf.ts` + `server/middleware/csrf.ts`. The `mira_csrf`
cookie is issued (once; not rotated per request) on every response that doesn't already carry one,
and every state-changing `/api/*` request must carry an `x-csrf-token` header matching it, compared
with `crypto.timingSafeEqual`.

**Why this on top of `SameSite=Lax`**, which every cookie this app sets already has: `SameSite=Lax`
alone already blocks the classic cross-site POST vector in a modern, compliant browser. It's
defense in depth for anyone on an older browser or a low-cost Android WebView that predates
consistent SameSite enforcement — a real, named part of this app's audience (NFR2) — and it's the
literal ask (item 2). The cookie is deliberately **not** `httpOnly`, since the whole point is that
same-origin JavaScript has to be able to read it and echo it back; it carries no authority by
itself (knowing it without also holding the session cookie proves nothing).

**Getting the header attached to every request without touching dozens of call sites** turned out
to be the hard part, for a reason worth recording: `app/plugins/csrf.ts` cannot just wrap and
reassign the global `$fetch` (the first, naive version of this had zero effect, confirmed
empirically — every mutating request kept coming back 403). Nuxt's own entry chunk evaluates
`globalThis.$fetch ||= ofetch.create(...)` once, at module top level, before any plugin runs, and
every composable in the app already holds a live import binding to _that_ captured instance — a
plugin reassigning `globalThis.$fetch` afterward changes nothing anyone already imported. The fix
patches the browser's native `window.fetch` instead (which ofetch's own `fetch` option reads from,
once, at that same lazy-creation point) via a plain, non-module `<script>` injected through
`useHead` with `tagPriority: -10`, so it renders — and executes — before Nuxt's own
`<script type="module">` entry tag. Verified end to end (real browser, not mocked) in
`tests/e2e/*.spec.ts`, all of which exercise real mutating actions through the actual UI.

Verified: `tests/integration/auth.test.ts`'s "CSRF protection on state-changing requests" describes
block (missing token, mismatched token, safe methods never checked); every mutating call across
the whole integration suite now goes through a `withCsrf()` helper, which is itself proof the
check is live everywhere, not just in dedicated tests — the existing 100+ integration tests would
not pass otherwise.

## Input validation (rule R8)

Every server route validates its input with zod — body, route params, and query string — and
rejects unknown keys with `.strict()` rather than silently stripping them. `server/utils/
validation.ts` holds the handful of fragments reused across routes (`uuidParamSchema`,
`slugParamSchema`, `emptyQuerySchema`/`emptyBodySchema` for routes that accept neither).

Before this PR, several route params (`id`, `sessionId`, `slug`, `code`) were only checked for
presence (`if (!x) badRequestError(...)`), not format — an invalid UUID reaching
`prisma.x.findUnique({ where: { id } })` against a `@db.Uuid` column throws a raw
`PrismaClientKnownRequestError`, not a clean 400. Every one of those now validates format first,
so the query never runs with malformed input. Routes with no legitimate query string now reject
one explicitly (`emptyQuerySchema`) rather than silently ignoring it.

Verified: `server/utils/validation.test.ts` (the schemas themselves);
`tests/integration/error-handling.test.ts` (a malformed route param is rejected cleanly, not as a
raw exception, through a real running server).

## Rate limiting

One interface (`RateLimiter`, `server/utils/rate-limit.ts`), several policies, each an
independent `InMemoryRateLimiter` instance so one endpoint's budget can never be exhausted by
traffic to another:

| Limiter                          | Budget                  | Applied to                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `authRateLimiter`                | 10 / 15 min / hashed IP | `register`, `login`, `claim-account`                                                                                                                                                                                                                                                                         |
| `clinicianAuthRateLimiter`       | 10 / 15 min / hashed IP | `clinician/login` — a separate budget, never shared with the person-being-screened realm                                                                                                                                                                                                                     |
| `screeningSubmissionRateLimiter` | 100 / 5 min / hashed IP | `screening/start`, `screening/[id]/complete` — deliberately more generous than the auth limiters: one hashed IP may be many legitimate concurrent people (a shared connection, NFR2), and a real person plausibly starting/completing more than one or two screenings in five minutes is already implausible |
| `conversationRateLimiter`        | 10 / min / hashed IP    | `conversation/[sessionId]/message` — strict, because every call that gets past the pre-filter is a real, billed LLM call                                                                                                                                                                                     |

In-memory, per-process — documented as the accepted MVP1 tradeoff (a Redis-backed
implementation is the seam `RateLimiter` leaves for later, not built here).

Verified: a dedicated rate-limit test per policy (`tests/integration/auth.test.ts`,
`tests/integration/conversation.test.ts`, `tests/integration/screening.test.ts`), each using a
synthetic per-test IP so it doesn't compete with the rest of that file's traffic; the underlying
`InMemoryRateLimiter` class itself in `server/utils/rate-limit.test.ts` (budget enforcement, per-key
isolation, window reset).

## Session security

| Property                                | Person-being-screened (`server/utils/auth.ts`)                                                                          | Clinician (`server/utils/clinician-auth.ts`)                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Sliding window                          | 30 days                                                                                                                 | 12 hours                                                      |
| Absolute ceiling (new here)             | 90 days                                                                                                                 | 7 days                                                        |
| Refresh threshold                       | 1 hour                                                                                                                  | 15 minutes                                                    |
| Token storage                           | HMAC-SHA256 hash only; raw token never persisted                                                                        | Same                                                          |
| Revocation                              | `logout.post.ts` deletes the row server-side                                                                            | `clinician/logout.post.ts` deletes the row server-side        |
| Rotation on privilege change (new here) | `claim-account.post.ts` (ANONYMOUS → REGISTERED) calls `rotateSession` — a brand-new token and row, the old one deleted | N/A — no privilege-change event exists in the clinician realm |

**Rotation on privilege change**, concretely: before this PR, upgrading an anonymous session to a
registered account kept the exact same session cookie throughout — only the `User` row's
`authMode`/`email`/`password` changed. `rotateSession` (`server/utils/auth.ts`) now issues a new
session and deletes the old row in the same call, so a session id that existed _before_ the
upgrade is dead _immediately after_ it — the only session-fixation-relevant event this app
currently has. Verified: `tests/integration/auth.test.ts`'s "preserves the pseudonym..." test
asserts the pre-upgrade cookie no longer authenticates anything once the upgrade completes.

**Absolute timeout**, concretely: a session in continuous use before this PR never expired — the
sliding window means "idle timeout," not "maximum lifetime." Both realms now also check
`createdAt` against a hard ceiling, independent of activity. Verified:
`tests/integration/auth.test.ts` and `tests/integration/clinician.test.ts` each backdate a real
session row's `createdAt` past the ceiling (leaving `expiresAt` untouched, isolating the assertion
to the absolute check specifically) and confirm the session stops authenticating.

**Not applicable, named honestly:** "invalidate all sessions on password change" (part of the
original brief) has no route to attach to — this app has no password-change feature yet, only
registration, login, and claim-account. `rotateSession`'s general mechanism (issue new, delete old)
is exactly what such a route would call — `prisma.session.deleteMany({ where: { userId } })` for
every _other_ session, specifically, once a password-change endpoint exists — but no such route
exists in this codebase to wire it into today.

## Global error handling (rule R8)

`server/error.ts`, registered as Nitro's error handler via `nitro.errorHandler` in
`nuxt.config.ts` (a plain relative path, `./server/error.ts` — Nitro's own `~` alias resolves
against `app/`, Nuxt's srcDir, not `server/`, in this config context; confirmed the hard way).
Replaces Nitro's default entirely, for every route.

The rule is simple and doesn't depend on any error-library heuristic: every error this app
deliberately throws (`server/utils/errors.ts`'s `badRequestError`/`unauthorizedError`/etc.)
carries a 4xx status and a `statusMessage` written to be read by the person using the app — those
pass through unchanged. Anything else — a genuine bug, a raw Prisma error that escaped a route, a
database constraint violation, literally any error with no status code or a 5xx one — always
becomes the same flat `{ statusCode: 500, statusMessage: "An unexpected error occurred. Please
try again." }`, regardless of what the underlying error actually says. The real error is still
captured server-side through `logger.ts`'s redactor (rule R4), explicitly _not_ under the key
`message` — `server/utils/privacy.ts`'s redaction denylist includes that key (it's the one live
chat content most often arrives under), which would otherwise silently blank out the one thing
this log line exists to capture.

Verified two ways: `server/error.test.ts` mocks `h3`/`logger` and asserts the exact
response/logging behaviour for both a known 4xx and a genuinely unhandled error (a fabricated
Prisma-shaped message and a real stack trace, both confirmed absent from the response body).
`tests/integration/error-handling.test.ts` proves the _wiring_ itself against a real built server
— a malformed JSON body reaches a clean, generic error, not h3's own default handler's output.
Deliberately not attempted: forcing a genuine uncaught 500 through this app's own public routes to
test end to end — the input-validation sweep above closed off the reachable paths that used to
produce one (an invalid UUID no longer reaches Prisma at all), so there is no longer a route left
that can naturally trigger this branch without contriving a test-only "break glass" endpoint,
which would be new production surface added purely for testability.

## Dependency audit

`npm audit` (2026-08-27): 5 advisories, all in transitive dev-only dependencies, none reachable at
runtime.

| Package                                                     | Severity | Advisory                                                                                                                               | Where it lives                                                                   | Runtime-reachable?                                                                                                                                          |
| ----------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `esbuild` (0.27.x, nested under `@eslint/config-inspector`) | Low      | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — arbitrary file read via esbuild's own dev server on Windows | `@nuxt/eslint`'s optional config-inspector UI (devDependency of a devDependency) | No — this app never runs `esbuild --serve`; not part of the production build or runtime                                                                     |
| `deepmerge-ts` (<8.0.0)                                     | High     | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) — stack exhaustion (DoS) merging recursive object graphs      | `@prisma/config`, used by the `prisma` CLI's own config loader                   | No — lives in the `prisma` CLI (a devDependency used for `migrate`/`generate`), not in `@prisma/client`, which is what actually runs in the deployed server |
| `@prisma/config`                                            | High     | Depends on the vulnerable `deepmerge-ts` above                                                                                         | `prisma` CLI                                                                     | No — same as above                                                                                                                                          |
| `prisma` (CLI)                                              | High     | Depends on the vulnerable `@prisma/config` above                                                                                       | Direct devDependency                                                             | No — CLI only; `@prisma/client` (the runtime package) is unaffected                                                                                         |

`npm audit fix` and `npm audit fix --force` were both run; neither changed anything —
confirmed via `git status` on `package.json`/`package-lock.json` before and after. This isn't a
tooling failure: no version of `prisma`/`@prisma/config` or `@eslint/config-inspector` has yet
been published that resolves to a fixed `deepmerge-ts`/`esbuild`, so there is currently nothing
for npm's resolver to select. These four advisories are genuinely unfixable right now without a
manual `overrides` pin (not applied — pinning a transitive dependency of the Prisma CLI outside
its own declared range risks breaking `migrate`/`generate` in a way that's hard to detect until it
matters) and are correctly assessed as low actual risk given none of them touch code that runs in
the deployed server process. Re-run `npm audit` periodically; this table should be updated (or
removed) once upstream ships a fix.

Ongoing scanning: [CodeQL](../.github/workflows/codeql.yml) (static analysis on every push) and
[Dependabot](../.github/dependabot.yml) (automated dependency-update PRs) — both already configured,
independent of this manual audit.

## Audit logging

`server/utils/audit.ts` — an append-only `AuditLog` table, distinct from the general application
log (`server/utils/logger.ts`, which the redactor governs per rule R4). Every clinician action on
a flagged case (status change, notes update, resource create/update), every DSAR export and
account deletion, and every retention-task run writes an entry with an actor, an action, an
entity, and (never PHI) metadata. See [privacy-controls.md](privacy-controls.md) for the full
table of what's audited and where.

## Authentication and session handling

Covered above under [Session security](#session-security) and the [threat
model](#threat-model)'s enumeration and clinician-account sections. The anonymous entry path
(rule R9) — `server/api/auth/anonymous-start.post.ts` — is FR1's first-class path, not a fallback:
screening is never gated behind registration anywhere in this app.

## Encryption at rest

Covered under [Database compromise](#3-database-compromise) above and in
[privacy-controls.md](privacy-controls.md), which has the full control table (`encryptField`/
`decryptField`, the boot-time key check, `hashIdentifier`).
