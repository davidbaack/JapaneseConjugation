import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { devHistoryPlugin } from './scripts/dev-history.js';

// https://vite.dev/config/
export default defineConfig({
  base: '/JapaneseConjugation/',
  plugins: [
    devHistoryPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,json}'],
        globIgnores: ['**/data/sentences/manifest.json', '**/data/sentences/by-type/*.json'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/JapaneseConjugation/index.html',
        navigateFallbackDenylist: [/\.[^/?]+$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === globalThis.location.origin &&
              url.pathname === '/JapaneseConjugation/data/sentences/manifest.json',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sentence-corpus-manifest-v1',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === globalThis.location.origin &&
              url.pathname.startsWith('/JapaneseConjugation/data/sentences/by-type/') &&
              url.pathname.endsWith('.json'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sentence-corpus-v1',
              expiration: {
                maxEntries: 140,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        id: '/JapaneseConjugation/',
        name: 'Katachiya · Japanese Conjugation SRS',
        short_name: 'Katachiya',
        description:
          'Practice Japanese verb and adjective conjugation with timed drills and offline support.',
        lang: 'en',
        theme_color: '#312e81',
        background_color: '#fafaf9',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/JapaneseConjugation/',
        start_url: '/JapaneseConjugation/',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    watch: {
      ignored: ['**/temp-vite/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    globals: true,
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/__mocks__/pwa-register.js', import.meta.url),
      ),
    },
  },
});
