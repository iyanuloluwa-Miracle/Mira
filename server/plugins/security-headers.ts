// [NFR1] Response security headers, applied to every request (API and page alike) via Nitro's
// h3-level 'request' and 'beforeResponse' hooks — see docs/security-controls.md for the threat
// each one addresses.
//
// CSP is the centrepiece: script-src carries a fresh per-request nonce and no 'unsafe-inline',
// so an attacker who manages to get their own markup into a rendered page (e.g. through a bug
// that lets user-controlled text reach v-html) still cannot get a <script> tag of their own to
// execute — they cannot know or predict the nonce for the request their payload lands in.
// style-src is 'self' only with no nonce and no 'unsafe-inline' at all: this app has zero inline
// <style> tags or `style="..."` attributes in its own markup (verified — see
// app/components/screening/ProgressBar.vue's WIDTH_CLASSES for the one place that would
// otherwise have needed one), so there is nothing to carve out an exception for.
//
// The nonce also has to reach Nuxt's own inline <script> tags (the import map and the
// window.__NUXT__ hydration payload) — Nuxt does not add nonces to those itself outside its
// experimental SSR-streaming renderer, which this app does not use. The 'render:html' hook
// below does it directly: by the time that hook fires, every head/body tag is already a plain
// HTML string, so a targeted regex adds `nonce="..."` to any <script> tag that doesn't already
// carry one, using the exact nonce value set for this request. `type="application/json"` data
// islands (the Nuxt payload's own data script) are not "script-like" per the CSP spec and don't
// need one, but nonce-ing them anyway is harmless.

import { randomBytes } from 'node:crypto'

const CSP_NONCE_BYTES = 16

// [NFR2] `npm run dev` needs a materially looser policy than production, for reasons that have
// nothing to do with this app's own code: Vite's CSS hot-reload injects/replaces <style> tags at
// runtime (production has no equivalent — CSS is fully extracted to static files there, see this
// file's own header comment), and vite-plugin-checker's error overlay and Nuxt DevTools' own UI
// (enabled via devtools: true in nuxt.config.ts) both need real inline execution and load Google
// Fonts for their own interface, unrelated to anything this app renders. None of that ships to
// production, and a strict CSP has no security value against the developer's own machine — so
// dev mode gets a permissive policy, production gets the real one below.
function buildCsp(nonce: string, isProduction: boolean): string {
  if (!isProduction) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'"
    ].join('; ')
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join('; ')
}

function injectNonceIntoScripts(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`)
}

declare module 'h3' {
  interface H3EventContext {
    nonce?: string
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.nonce = randomBytes(CSP_NONCE_BYTES).toString('base64')
  })

  // Fires only for full-page SSR renders (never for /api/* JSON responses, which have no HTML
  // to nonce in the first place) — see server/plugins/README.md-adjacent code comments in this
  // file's own header for why this specific hook and not a simpler string-replace on the final
  // response body.
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = event.context.nonce
    if (!nonce) return
    html.head = html.head.map((tag) => injectNonceIntoScripts(tag, nonce))
    html.bodyPrepend = html.bodyPrepend.map((tag) => injectNonceIntoScripts(tag, nonce))
    html.body = html.body.map((tag) => injectNonceIntoScripts(tag, nonce))
    html.bodyAppend = html.bodyAppend.map((tag) => injectNonceIntoScripts(tag, nonce))
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const nonce = event.context.nonce ?? randomBytes(CSP_NONCE_BYTES).toString('base64')
    setResponseHeader(
      event,
      'content-security-policy',
      buildCsp(nonce, process.env.NODE_ENV === 'production')
    )
    // Two years, subdomains included — this app has no subdomains that need to stay on plain
    // HTTP, and a shorter max-age just gives a network attacker a bigger window to strip HTTPS
    // on a return visit after the header expires. Harmless to send over a plain-HTTP dev
    // connection: browsers are required to ignore Strict-Transport-Security unless the response
    // that carried it was itself already over HTTPS.
    setResponseHeader(
      event,
      'strict-transport-security',
      'max-age=63072000; includeSubDomains; preload'
    )
    setResponseHeader(event, 'x-content-type-options', 'nosniff')
    setResponseHeader(event, 'referrer-policy', 'no-referrer')
    setResponseHeader(event, 'permissions-policy', 'camera=(), microphone=(), geolocation=()')
    // Beyond the brief's explicit list, but the same family of concern (clickjacking / cross-
    // origin leakage) and low-risk to add: frame-ancestors above already blocks embedding in a
    // modern browser, X-Frame-Options is the same protection for older ones that don't read CSP.
    setResponseHeader(event, 'x-frame-options', 'DENY')
    setResponseHeader(event, 'cross-origin-opener-policy', 'same-origin')
    setResponseHeader(event, 'cross-origin-resource-policy', 'same-origin')
  })
})
