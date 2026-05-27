import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/JapaneseConjugation/',
  plugins: [
    react(),
    tailwindcss()
  ],
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
    globals: true,
  }
})
