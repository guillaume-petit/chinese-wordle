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
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,txt}'],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
      },
    }),
  ],
})
