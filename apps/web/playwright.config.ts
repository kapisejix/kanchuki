import { defineConfig, devices } from '@playwright/test'

// Admin UI regression tests. The suite mocks every /v1/* API call in-page
// (see e2e/admin-navigation.spec.ts), so it exercises layout/navigation
// behavior only and needs no live backend, database, or seeded data.
//
// Browsers: `channel: 'chrome'` runs the system-installed Chrome — no
// `npx playwright install` browser download required.
//
// Server: `webServer` starts `next dev` on port 3000 and reuses an already
// running dev server locally (CI always starts a fresh one).
export default defineConfig({
  testDir: './e2e',
  // The customer/PWA suite runs against a production server in
  // playwright.customer.config.ts (the Serwist SW is disabled in dev) — keep
  // it out of the fast dev-server run.
  testIgnore: '**/customer-collection.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // CI uploads playwright-report/ as an artifact on failure — the html
  // reporter is what produces that directory. Locally keep it quiet (list only).
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: 'http://localhost:3000',
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  // next dev compiles each admin route on first visit — a cold compile can
  // exceed expect()'s 5s default; give assertions headroom so the suite is
  // not flaky on fresh CI runners with an empty .next cache.
  expect: {
    timeout: 15_000,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Pin the API origin for the server Playwright starts. NOTE: with
    // reuseExistingServer (non-CI), an already-running dev server keeps its
    // own env — harmless here because the spec intercepts every /v1/* call
    // in-page via page.route, so the admin panel never actually reaches the
    // network either way.
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
    },
  },
})
