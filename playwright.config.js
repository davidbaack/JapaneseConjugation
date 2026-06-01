import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 4,
  retries: process.env.CI ? 1 : 0,
  use: {
    headless: true,
    baseURL: 'http://localhost:4173/JapaneseConjugation/',
  },
  // Cross-engine coverage. Katachiya leans on the Web Speech API and Service
  // Workers, so WebKit (Safari/iOS — the PWA's likely primary platform) and
  // Firefox catch engine-specific breakage Chromium alone would miss.
  // Set PW_PROJECT (e.g. PW_PROJECT=chromium) to scope a run to one engine.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ].filter((p) => !process.env.PW_PROJECT || p.name === process.env.PW_PROJECT),
  // Start the vite preview server before running e2e tests
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    timeout: 60000,
    reuseExistingServer: false,
  },
});
