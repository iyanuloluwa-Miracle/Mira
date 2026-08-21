import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()]
  },
  fonts: {
    families: [
      {
        name: 'Lexend',
        provider: 'google',
        global: true,
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900]
      }
    ]
  },
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
  }
})
