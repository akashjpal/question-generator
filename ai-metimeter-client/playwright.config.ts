import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

// Auto-loads TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD / PLAYWRIGHT_BASE_URL from
// .env.test so you only have to create that file once (see .env.test.example) instead
// of exporting them into every shell session. Safe to keep even if the file is absent.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

/**
 * This config only boots the Angular dev server (frontend). It does NOT start the
 * backend services the app talks to (question-generator API, AttemptAPI, ReportsAPI,
 * agent API, Redis, ClamAV) or Supabase. Those must already be running — from the repo
 * root: `docker compose up` — before running this suite. See root CLAUDE.md.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // Capped (not `undefined`/full-CPU) locally too: several specs write real attempts
  // through AttemptAPI to a remote Supabase Postgres pooler, and running too many of
  // those writes concurrently causes latency spikes that flake the 15s UI assertions
  // waiting on them.
  workers: 1,
  reporter: 'html',
  // 45s (not the default 30s): a few specs' 20s submit-result waits (see attempt-flow.spec.ts
  // and dashboard-helpers.ts) plus their surrounding steps can otherwise exceed a 30s test budget.
  timeout: 45_000,
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      // Only the tests tagged @responsive run under the mobile viewport project —
      // avoids duplicating the full (and partly LLM-backed) suite across viewports.
      grep: /@responsive/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
