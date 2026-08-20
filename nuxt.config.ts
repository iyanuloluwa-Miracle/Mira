import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()]
  },
  fonts: {
    families: [
      { name: 'Lexend', provider: 'google', global: true, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] }
    ]
  }
})
