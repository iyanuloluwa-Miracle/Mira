import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Mira — a private mental health check-in'
    }
  },
  vite: {
    plugins: [tailwindcss()]
  },
  // [NFR2] No web fonts — every device this app targets already has a perfectly good one
  // installed, and a system font stack costs 0 bytes and 0 requests. See main.css.
  typescript: {
    strict: true,
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true
      }
    }
  },
  eslint: {
    config: {
      stylistic: false // formatting is Prettier's job, not ESLint's
    }
  },
  // [R3] The crisis pathway must render with zero network dependency and no loading state —
  // prerendering it means the very first response for this route is already the full page.
  routeRules: {
    '/support/crisis': { prerender: true }
  },
  // [NFR1] Registers server/tasks/retention.ts on a daily schedule. Nitro's tasks feature is
  // marked @experimental in the installed nitropack version's own types but is the current,
  // functional convention for a scheduled job — there is no stable alternative to prefer over
  // it. 03:00 UTC: low-traffic for this app's expected audience, and clear of any specific
  // request's own latency budget (NFR3), since this never runs inside a request.
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: {
      '0 3 * * *': ['retention']
    }
  }
})
