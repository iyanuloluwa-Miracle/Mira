// [NFR1] Attaches the mira_csrf cookie's value as an x-csrf-token header on every
// state-changing request, transparently, for every $fetch call in the app — none of them need to
// know this exists (app/composables/useAuth.ts and every page that calls $fetch directly).
//
// This can't be done by wrapping and reassigning the global $fetch from an ordinary plugin: by
// the time any plugin runs, Nuxt's own entry chunk has already evaluated
// `globalThis.$fetch ||= ofetch.create(...)` at module top level and every composable in the app
// already holds a live import binding to *that* instance, captured once — reassigning
// globalThis.$fetch afterward changes nothing anyone already imported (confirmed empirically:
// the naive version of this plugin had zero effect and every mutating request kept coming back
// 403). What actually runs before that line is a plain, non-module <script> placed earlier in
// <head> than Nuxt's own `<script type="module">` entry tag — this plugin injects exactly that
// via useHead, patching the browser's native window.fetch (which ofetch's own default `fetch`
// option reads from once, lazily, on that same first call) before Nuxt's entry module ever gets
// the chance to capture an unpatched reference. tagPriority -10 keeps it ordered first among head
// tags; server/plugins/security-headers.ts nonces it like any other inline script.

const CSRF_BOOTSTRAP_SCRIPT = `(function () {
  if (window.__miraCsrfPatched) return;
  window.__miraCsrfPatched = true;
  var nativeFetch = window.fetch.bind(window);
  var SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
  window.fetch = function (input, init) {
    var method = ((init && init.method) || 'GET').toUpperCase();
    if (SAFE_METHODS.indexOf(method) === -1) {
      var match = document.cookie.match(/(?:^|; )mira_csrf=([^;]*)/);
      if (match) {
        var headers = new Headers((init && init.headers) || {});
        headers.set('x-csrf-token', decodeURIComponent(match[1]));
        init = Object.assign({}, init, { headers: headers });
      }
    }
    return nativeFetch(input, init);
  };
})();`

export default defineNuxtPlugin(() => {
  useHead({
    script: [{ innerHTML: CSRF_BOOTSTRAP_SCRIPT, tagPosition: 'head', tagPriority: -10 }]
  })
})
