import { test, expect, type Page } from '@playwright/test'

// Regression test for the admin layout navigation fix (see
// apps/web/src/app/admin/layout.tsx): previously an AnimatePresence
// mode="wait" exit gate + Suspense could get stuck after a nav click,
// leaving a blank content area until a hard refresh. This spec proves the
// opposite invariant: sidebar/top bar stay mounted, the content area swaps
// to the new page, and NOTHING triggers a full document reload.
//
// The suite is hermetic — every /v1/* API call is answered with canned JSON
// via route mocks below, so no backend, database, or seeded data is needed.
// It tests layout/navigation behavior only.

const ADMIN_KEY = 'e2e-admin-test-key'

// ── API mocks ─────────────────────────────────────────────────────
async function mockAdminApi(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const url = route.request().url()
    const respond = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      })

    if (url.includes('/admin/stats')) {
      return respond({
        total_retailers: 12,
        active_subscriptions: 5,
        trial_retailers: 3,
        total_products: 340,
        total_collections: 28,
        views_this_month: 4100,
        enquiries_this_month: 150,
      })
    }
    if (url.includes('/admin/usage')) {
      return respond({
        total_retailers: 12,
        trial_retailers: 3,
        active_subscriptions: 5,
        mrr_inr: 124900,
        try_on_this_month: 22,
        try_on_cost_usd: 1.1,
      })
    }
    if (url.includes('/admin/alerts')) return respond([])
    if (url.includes('/admin/plan-limits')) return respond([])
    if (url.includes('/team/reporting/agents')) return respond([])
    if (url.includes('/team/reporting/coverage-gaps')) return respond({ total_gaps: 0, gaps: [] })
    if (url.includes('/team/reporting/retailer-activation')) {
      return respond({
        total_retailers: 0,
        onboarding_completed: 0,
        trial: 0,
        active_subscription: 0,
        cancelled: 0,
        onboarding_rate: 0,
        trial_to_active_rate: 0,
      })
    }
    if (url.includes('/admin/retailers') || url.includes('/admin/customers')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { has_more: false, cursor: null } }),
      })
    }
    return respond({})
  })
}

// Typed window sentinels — `window` state is destroyed by a full reload,
// so these prove navigation stayed client-side.
type TestWindow = Window & {
  __adminNavSentinel?: string
  __sidebarRef?: Element | null
}

// Pages visited through the real sidebar: sidebar link label → expected
// h1 in the swapped content area → expected URL.
const NAV_PAGES = [
  { link: 'Retailers', heading: 'Retailers', url: /\/admin\/retailers$/ },
  { link: 'Customers', heading: 'Customers', url: /\/admin\/customers$/ },
  { link: 'Billing', heading: 'Billing', url: /\/admin\/billing$/ },
  { link: 'Reports', heading: 'Manager Reports', url: /\/admin\/reports$/ },
]

test('admin pages swap the content area in place — no full page reload', async ({ page }) => {
  await mockAdminApi(page)

  // Pre-seed the admin session before any page script runs so the layout's
  // sessionStorage check passes and the login screen never mounts.
  await page.addInitScript((key) => {
    sessionStorage.setItem('admin_key', key)
  }, ADMIN_KEY)

  // Count full document loads. Client-side navigation never fires `load`;
  // a full reload always does. Must stay at exactly 1 (the initial goto).
  let loadCount = 0
  page.on('load', () => {
    loadCount += 1
  })

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  expect(loadCount).toBe(1)

  // Pin two reload sentinels into the JS context:
  //   1. __adminNavSentinel — wiped only by a document reload
  //   2. __sidebarRef — the sidebar's DOM node, so we can prove the layout
  //      never remounted (same node identity across navigations)
  await page.evaluate(() => {
    const w = window as TestWindow
    w.__adminNavSentinel = 'persisted'
    w.__sidebarRef = document.querySelector('aside')
  })

  let previousHeading = 'Dashboard'
  for (const { link, heading, url } of NAV_PAGES) {
    await page.getByRole('link', { name: link, exact: true }).click()

    // Content area swapped: new page's h1 visible, previous page's h1 gone
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: previousHeading, exact: true })).toBeHidden()

    // No full reload, and the shell stayed mounted:
    const sentinel = await page.evaluate(() => (window as TestWindow).__adminNavSentinel)
    expect(sentinel).toBe('persisted')
    expect(loadCount).toBe(1)
    const sidebarPersisted = await page.evaluate(
      () => document.querySelector('aside') === (window as TestWindow).__sidebarRef,
    )
    expect(sidebarPersisted).toBe(true)

    previousHeading = heading
  }

  // Grouped nav item — Plans ▸ Plan Limits opens a hover flyout (portal).
  await page.getByRole('button', { name: 'Plans', exact: true }).hover()
  const planLimits = page.getByRole('link', { name: 'Plan Limits', exact: true })
  await expect(planLimits).toBeVisible()

  // The flyout unmounts the instant the pointer leaves the group row (it
  // renders 8px to the right of the sidebar in a portal with no keep-open
  // bridge across the gap), so a raw mouse click can't reliably reach it.
  // Dispatch the anchor's click instead — Next Link's onClick still runs and
  // performs a genuine client-side route change through the App Router.
  await planLimits.evaluate((el) => (el as HTMLElement).click())

  await expect(page).toHaveURL(/\/admin\/plan-limits$/)
  await expect(page.getByRole('heading', { name: 'Plan Limits', exact: true })).toBeVisible()
  // Same swap invariant as the loop: previous page's content is gone
  await expect(page.getByRole('heading', { name: 'Manager Reports', exact: true })).toBeHidden()
  expect(await page.evaluate(() => (window as TestWindow).__adminNavSentinel)).toBe('persisted')
  expect(loadCount).toBe(1)
})
