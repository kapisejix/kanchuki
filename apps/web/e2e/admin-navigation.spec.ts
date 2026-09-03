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
    // Plan Limits & Pricing fetches two endpoints; without this the pricing
    // call hits the catch-all `respond({})` → data is `{}`, and the page's
    // `for (const row of pricingData)` throws (TypeError: not iterable) →
    // "Admin page crashed" renders instead of the page heading.
    if (url.includes('/admin/plan-pricing')) return respond([])
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

// Pages visited through the real sidebar. Since the sidebar redesign, every
// nav item is a group button (Overview, Retailers & Network, …) whose child
// links live in a hover flyout portal — so each entry names the group that
// must be hovered plus the leaf link label, the expected h1 in the swapped
// content area, and the expected URL.
const NAV_PAGES = [
  { group: 'Retailers & Network', link: 'Retailers', heading: 'Retailers', url: /\/admin\/retailers$/ },
  { group: 'Retailers & Network', link: 'Customers', heading: 'Customers', url: /\/admin\/customers$/ },
  { group: 'Reports & Finance', link: 'Billing & Invoices', heading: 'Billing', url: /\/admin\/billing$/ },
  { group: 'Reports & Finance', link: 'Overview', heading: 'Manager Reports', url: /\/admin\/reports$/ },
]

test('admin pages swap the content area in place — no full page reload', async ({ page }) => {
  // next dev compiles each admin route on first visit — a cold compile can
  // take 20-40s on a busy Windows dev box and far outlast the 15s expect
  // timeout (the URL swaps instantly; the h1 waits on the compile). Cap this
  // test well above the sum of cold compiles rather than asserting against a
  // racing server.
  test.setTimeout(240_000)
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
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
    timeout: 60_000,
  })
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
  for (const { group, link, heading, url } of NAV_PAGES) {
    // Grouped nav item — hover opens the flyout (portal) next to the row.
    // Same mechanics as the Plans ▸ Plan Limits epilogue below: the portal
    // unmounts when the pointer leaves the group row (it renders 8px to the
    // right with no keep-open bridge), so a raw mouse click can't reliably
    // reach it. Activate the link with the keyboard instead — focus() never
    // moves the pointer (the row stays hovered, portal stays open) and the
    // resulting Enter is a trusted click on the Next Link, so the App Router
    // route change is real. Synthetic el.click() proved flaky here: Next
    // intermittently drops it and the URL never moves.
    // Park the pointer between iterations: the click closed the portal but
    // left the mouse on the same group row, so a repeat hover() would fire
    // no new mouseenter and the flyout would never reopen.
    await page.mouse.move(0, 0)
    await page.getByRole('button', { name: group, exact: true }).hover()
    const navLink = page.getByRole('link', { name: link, exact: true })
    await expect(navLink).toBeVisible()
    await navLink.focus()
    await page.keyboard.press('Enter')

    // Content area swapped: new page's h1 visible, previous page's h1 gone.
    // Long timeout for the h1: the URL swaps on client-side nav immediately,
    // but a first-visit next dev compile can delay the render by tens of
    // seconds (see test.setTimeout above).
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
      timeout: 60_000,
    })
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

  // Final hop into a superAdmin-only page — Plan Limits sits in the
  // Reports & Finance flyout (the old top-level Plans group was folded into
  // it in the sidebar redesign), same hover + keyboard activation mechanics
  // as the loop above.
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: 'Reports & Finance', exact: true }).hover()
  const planLimits = page.getByRole('link', { name: 'Plan Limits', exact: true })
  await expect(planLimits).toBeVisible()
  await planLimits.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/admin\/plan-limits$/)
  await expect(page.getByRole('heading', { name: 'Plan Limits & Pricing', exact: true })).toBeVisible({
    timeout: 60_000,
  })
  // Same swap invariant as the loop: previous page's content is gone
  await expect(page.getByRole('heading', { name: 'Manager Reports', exact: true })).toBeHidden()
  expect(await page.evaluate(() => (window as TestWindow).__adminNavSentinel)).toBe('persisted')
  expect(loadCount).toBe(1)
})
