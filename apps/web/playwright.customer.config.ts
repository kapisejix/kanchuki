import { defineConfig, devices } from '@playwright/test'

// Customer-facing PWA suite — collection pages (/c/[slug]) + offline behavior
// (see e2e/customer-collection.spec.ts).
//
// Runs against a production build (`turbo build` + `next start`) on :3100 —
// the Serwist SW is always enabled in prod builds and its precache manifest
// contains the content-hashed JS/CSS chunks, so the offline caching rules in
// src/app/sw.ts (the same code that ships to prod) can be exercised for real.
// (A dev-mode server can't serve those chunks offline — the page never
// hydrates — so `next dev` + KANCHUKI_E2E_SW=1 was abandoned.) The spec spins
// up its own stub API on :3001 — the URL NEXT_PUBLIC_API_URL is pinned to —
// because collection pages are server-rendered and Playwright's browser
// routing can't reach server-side fetches. This is a separate config from
// playwright.config.ts (dev server, admin suite) so the two suites can be run
// independently.
//
// NOTE: both suites share apps/web/.next — don't run them concurrently.
// This suite performs a prod build (turbo --force, no cache) into .next;
// running it while the admin suite's dev server or `pnpm dev` is active
// would clobber their dev artifacts (and vice versa — the admin suite's
// `next dev` regenerates .next afterwards, but that's a wasted rebuild).
// Prefer running the admin suite first, then this one.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/customer-collection.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // Separate report/results dirs so the admin + customer suites don't
  // overwrite each other's artifacts in CI.
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report-customer', open: 'never' }]]
    : [['list']],
  outputDir: 'test-results-customer',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: 'http://localhost:3100',
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  expect: {
    timeout: 15_000,
  },
  webServer: {
    // Run against a production build (`turbo build` + `next start`), NOT
    // `next dev`. The Serwist precache manifest only contains content-hashed
    // prod chunks — in dev mode an offline reload serves the cached HTML
    // document but not the JS/CSS chunks, so hydration never runs and the
    // page stays stuck at framer-motion's initial state (opacity 0 + raw
    // unstyled SSR layout — the grid even loses max-w-md, which put the
    // last card's <img> on top of the pagination Next button). That dead
    // page is not what the offline behavior is meant to test.
    //
    // Build goes through turbo (the CI/Railway entry point). The web app's
    // own `build` script now wraps `next build` in scripts/build.mjs to force
    // NODE_ENV=production (an inherited NODE_ENV=development from a sourced
    // .env made the dev React renderer crash prerendering /404 /500
    // /_not-found with "<Html> should not be imported outside of
    // pages/_document"); turbo sets the same production env for build tasks.
    command:
      'pnpm exec turbo build --filter=@kanchuki/web --force && pnpm --filter @kanchuki/web exec next start -p 3100',
    url: 'http://localhost:3100',
    // Always boot fresh: the build must regenerate public/sw.js and the
    // content-hashed chunks before `next start` serves them.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      // Pinned to the stub API origin the spec serves from :3001.
      // NEXT_PUBLIC_* is inlined at build time, so this must be set here —
      // it applies to both the build step and the runtime server.
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
    },
  },
})
