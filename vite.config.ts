import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '词语 Daily',
        short_name: '词语 Daily',
        description: 'One Chinese word a day.',
        theme_color: '#e9eadf',
        background_color: '#e9eadf',
        display: 'standalone',
        icons: [
          { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The dictionary (~3.6 MB) and curated words (~4.5 MB) are separate hashed JSON assets,
        // precached for offline play; the limit leaves room for curated content to grow.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,txt,json}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
})
