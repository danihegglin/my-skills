// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://subrocket.io',
  prefetch: true,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
