import { test, expect } from '@playwright/test'
import type { Server } from 'node:http'
import { API_STUB_ORIGIN, closeStub, createStubServer, listenStub } from './support/api-stub'
import { stubFixtureImages } from './support/images'
import {
  VIEWPORTS,
  expectNoHorizontalOverflow,
  expectRenderedImage,
  watchClientErrors,
} from './support/responsive'
import type { PublicCollection, PublicProduct } from '@kanchuki/shared'

// F-036 Phase A live verification — /my-stores tap-through + install CTA.
//
// Everything here is REAL except the data: a real `next start` production
// build, real Chrome, real navigation and history, real DOM. The API is a
// stub on :3001 because /{store} is server-rendered — fetchProfile() and
// fetchAllProducts() run inside `next start`, where browser-side routing
// cannot reach them (same constraint the collection suite documents).
//
// Why a prod build rather than `next dev`: the install CTA depends on
// `beforeinstallprompt`, which Chrome only fires for an *installable* page
// (manifest + a service worker with a fetch handler). The Serwist SW is only
// active in production builds, so a dev server would make the installability
// check meaningless.
//
// ── What this proves that the unit tests cannot ────────────────────
// 1. A row taps through to the REAL catalog route and the store actually
//    renders — a unit test asserts the href string, not that anything is
//    behind it.
// 2. The install listener is attached at STARTUP, before any CTA component
//    mounts. The probe dispatches a synthetic beforeinstallprompt while the
//    list is still loading (so nothing is mounted) and asserts the event was
//    preventDefault()ed. With the listener restored to a component effect —
//    the shape this was fixed from — no listener exists at that moment, the
//    event is not prevented, and the probe fails.
// 3. Chrome's own verdict on whether the deployed build is installable at
//    all, which is what gates the real event.

const STORE_SLUG = 'meera-sarees'
const SECOND_SLUG = 'gupta-textiles'
const UNPUBLISHED_NAME = 'Newly Opened Tailors'

// ── Canned data ───────────────────────────────────────────────────

type Visit = {
  retailer: {
    id: string
    shop_name: string
    city: string | null
    logo_url: string | null
    public_slug: string | null
  }
  last_visited_at: string
  visit_count: number
  is_muted: boolean
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

/** Three visits, newest first, the third with no storefront slug yet. */
function visits(): Visit[] {
  return [
    {
      retailer: {
        id: 'retailer-meera',
        shop_name: 'Meera Sarees',
        city: 'Jaipur',
        logo_url: null,
        public_slug: STORE_SLUG,
      },
      last_visited_at: minutesAgo(5),
      visit_count: 3,
      is_muted: false,
    },
    {
      retailer: {
        id: 'retailer-gupta',
        shop_name: 'Gupta Textiles',
        city: 'Ludhiana',
        logo_url: null,
        public_slug: SECOND_SLUG,
      },
      last_visited_at: minutesAgo(2 * 24 * 60),
      visit_count: 1,
      is_muted: false,
    },
    {
      retailer: {
        id: 'retailer-new',
        shop_name: UNPUBLISHED_NAME,
        city: 'Surat',
        logo_url: null,
        public_slug: null,
      },
      last_visited_at: minutesAgo(10 * 24 * 60),
      visit_count: 1,
      is_muted: false,
    },
  ]
}

function product(i: number): PublicProduct {
  const n = i + 1
  return {
    id: `prod-${n}`,
    name: `Festive Design ${n}`,
    price_min: 49900 + n * 1000,
    price_max: 59900 + n * 1000,
    status: 'AVAILABLE',
    category: 'Anarkali Suit',
    subtype: 'Festive Kurti',
    primary_color: 'Maroon',
    is_new_arrival: n <= 3,
    on_sale: n % 2 === 0,
    location: null,
    primary_photo_url: `https://cdn-e2e.r2.dev/design-${n}.jpg`,
    has_360: false,
    avg_rating: 0,
    rating_count: 0,
  }
}

function collectionFor(slug: string): PublicCollection {
  return {
    retailer: {
      id: 'retailer-meera',
      shop_name: 'Meera Sarees',
      city: 'Jaipur',
      phone: '919999999999',
      logo_url: null,
      banner_url: null,
      public_slug: slug,
      latitude: null,
      longitude: null,
    },
    title: 'All Products',
    description: 'Everything in the store.',
    expires_at: null,
    products: [product(0), product(1)],
    total: 2,
    page: 1,
    page_size: 12,
    filters: {
      categories: [{ value: 'Anarkali Suit', count: 2 }],
      colors: [{ value: 'Maroon', count: 2 }],
    },
  }
}

// ── Stub API server (serves SSR fetches inside `next start`) ──────

type StubState = {
  /** When false, the passport endpoints answer 401 (signed-out shopper). */
  signedIn: boolean
  /** When false, /me matches but /stores still 401s — the page's own
   *  anonymous branch, which the layout guard otherwise prevents from
   *  ever being reached. */
  storesAuthorized: boolean
  /** Every API path the server was asked for, in order. */
  requests: string[]
}

let apiStub: Server | null = null
const state: StubState = { signedIn: true, storesAuthorized: true, requests: [] }

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const url = new URL(req.url ?? '/', API_STUB_ORIGIN)
    const path = url.pathname
    state.requests.push(`${req.method} ${path}`)

    if (path === '/v1/public/passport/me') {
      if (!state.signedIn) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, {
        account: {
          id: 'customer-1',
          name: 'Ananya',
          phone_masked: '••••••9999',
          usual_size: 'M',
          city: 'Jaipur',
        },
      })
      return
    }

    // /my-profile reads recently-viewed on mount (through the passport proxy).
    if (path === '/v1/public/passport/recently-viewed') {
      json(res, 200, { items: [] })
      return
    }

    // The personalization opt-out. RC-026: /my-profile has always PUT to this
    // path, but the web proxy had no PUT verb and omitted `preferences` from
    // its allowlist, so the call 405'd before it ever got here.
    if (path === '/v1/public/passport/preferences' && req.method === 'PUT') {
      json(res, 200, { ok: true })
      return
    }

    if (path === '/v1/public/passport/stores') {
      if (!state.signedIn || !state.storesAuthorized) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, { stores: visits() })
      return
    }

    // Login round trip. The real API mints the passport cookie here; the stub
    // stands in for that by flipping the flag every other handler reads, so the
    // guard's next session check succeeds exactly as it would with the cookie.
    if (path === '/v1/public/passport/otp/send' && req.method === 'POST') {
      json(res, 200, { ok: true, masked_phone: '••••••9999' })
      return
    }

    if (path === '/v1/public/passport/otp/verify' && req.method === 'POST') {
      state.signedIn = true
      json(res, 200, {
        ok: true,
        account_id: 'customer-1',
        is_new: false,
        name: 'Ananya',
        phone_masked: '••••••9999',
      })
      return
    }

    // Store profile — what /{public_slug} renders into ContactGate.
    const retailerMatch = path.match(/^\/v1\/public\/retailers\/([^/]+)$/)
    if (req.method === 'GET' && retailerMatch) {
      const slug = decodeURIComponent(retailerMatch[1]!)
      const known: Record<string, string> = {
        [STORE_SLUG]: 'Meera Sarees',
        [SECOND_SLUG]: 'Gupta Textiles',
      }
      if (!known[slug]) {
        json(res, 404, { error: { code: 'NOT_FOUND', message: 'Store not found' } })
        return
      }
      json(res, 200, {
        data: {
          shop_name: known[slug],
          city: 'Jaipur',
          state: 'Rajasthan',
          address_line1: null,
          address_line2: null,
          categories: ['Sarees'],
          logo_url: null,
          banner_url: null,
          storefront_slug: 'festive-edit',
        },
      })
      return
    }

    // View tracking. RC-025: the storefront has always POSTed this, but the web
    // proxy route between it and the API did not exist, so every page view
    // 404'd and the retailer "Views" stat never counted web traffic. The stub
    // answering here is what lets the test assert the ping actually arrives.
    if (req.method === 'POST' && /^\/v1\/public\/collections\/[^/]+\/view$/.test(path)) {
      json(res, 204, {})
      return
    }

    // Active promotions — the storefront's PromotionBanner fetches
    // `/api/{store}/promotions`, which proxies to this upstream. Leaving it
    // unstubbed made the proxy answer 404, which the console check below
    // (correctly) reported as a page error even though the app handled it.
    if (path.match(/^\/v1\/public\/retailers\/[^/]+\/promotions$/) && req.method === 'GET') {
      json(res, 200, { data: [] })
      return
    }

    // Storefront product listing (page 1 of the gated catalog).
    const productsMatch = path.match(/^\/v1\/public\/retailers\/([^/]+)\/products$/)
    if (req.method === 'GET' && productsMatch) {
      json(res, 200, { data: collectionFor(decodeURIComponent(productsMatch[1]!)) })
      return
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: `No stub for ${path}` } })
  })

  await listenStub(apiStub)
})

test.afterAll(async () => {
  await closeStub(apiStub)
})

test.beforeEach(async ({ context }) => {
  state.signedIn = true
  state.storesAuthorized = true
  state.requests = []
  // Dismissal is per-device; start every test from a clean browser profile.
  await context.clearCookies()
})

// ── 1. Tap-through ────────────────────────────────────────────────

test('a signed-in shopper sees their stores newest-first and a row opens the real catalog', async ({
  context,
  page,
}) => {
  const client = watchClientErrors(page)
  // The row taps through to the storefront, which renders product photos — so
  // this test needs the fixture images served too, or its "real catalog"
  // assertion is passing over a page whose photos all failed.
  await stubFixtureImages(context)

  await page.goto('/my-stores')

  await expect(page.getByRole('heading', { name: 'My Stores' })).toBeVisible()
  await expect(page.getByText("3 stores you've visited.")).toBeVisible()

  // Newest first, and the third row honestly reports it has no catalog page.
  const hrefs = await page
    .locator('ul li a')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href')))
  expect(hrefs).toEqual([`/${STORE_SLUG}`, `/${SECOND_SLUG}`])
  expect(await page.getByText("This store hasn't published a catalog page yet.").count()).toBe(1)
  expect(await page.getByText(UNPUBLISHED_NAME).count()).toBe(1)

  // Relative labels, not raw timestamps.
  await expect(page.getByText('5 min ago', { exact: false })).toBeVisible()

  // Tap through. This is the whole feature: the row must open the store's
  // existing catalog route, not a second browsing mechanism.
  await page.locator(`ul li a[href="/${STORE_SLUG}"]`).click()
  await page.waitForURL(`**/${STORE_SLUG}`)

  // The catalog really rendered. ContactGate carries the store name from the
  // server-rendered profile, so seeing it proves the SSR fetch resolved this
  // store rather than 404ing into Next's not-found page.
  await expect(page.getByText('Meera Sarees').first()).toBeVisible()
  expect(await page.getByText('Store Not Found', { exact: false }).count()).toBe(0)

  // …and it is the store's real catalog, not just its shell: both stubbed
  // products and the collection header come from the SSR products fetch.
  await expect(page.getByText('Festive Design 1')).toBeVisible()
  await expect(page.getByText('Festive Design 2')).toBeVisible()
  await expect(page.getByText('2 curated items', { exact: false })).toBeVisible()
  // …and the destination actually rendered its photos, which is what "a real
  // catalog" means to the person who tapped the row.
  await expectRenderedImage(
    page.getByRole('img', { name: 'Festive Design 1', exact: true }).first(),
    'the tapped-through catalog photo',
  )

  // A shopper who already holds a passport is recognised and let straight in —
  // no re-verification prompt. (ContactGate shows the phone input only for a
  // visitor it cannot identify.)
  expect(await page.getByPlaceholder('10-digit mobile number').count()).toBe(0)

  // The products listing was fetched server-side for the gated catalog.
  expect(state.requests).toContain(`GET /v1/public/retailers/${STORE_SLUG}/products`)

  // …and the view ping reaches the API, which is the wiring RC-025 was missing:
  // the client fired it, the route did not exist, so it 404'd and no web view
  // was ever counted. POLLED because the call is fire-and-forget — the upstream
  // request lands after the route answers the browser, so sampling here would
  // be the RC-024 mistake again.
  await expect
    .poll(
      () =>
        state.requests.filter(
          (r) => r.startsWith('POST /v1/public/collections/') && r.endsWith('/view'),
        ).length,
      {
        message:
          'the storefront view ping never reached the API — that is exactly the missing proxy route RC-025 describes',        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0)

  client.expectClean('the tapped-through catalog')
})



// ── 2. Install CTA ────────────────────────────────────────────────

test('the install listener is attached at startup, before any CTA component mounts', async ({
  page,
}) => {
  // Hold the stores response so the CTA's host component cannot have mounted
  // when the install event arrives — the exact timing that lost the event
  // when the listener lived in a component effect.
  await page.route('**/api/passport/stores', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.continue()
  })

  await page.goto('/my-stores')

  // Still loading: the skeleton is up and no CTA exists yet.
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  expect(await page.getByRole('button', { name: /Add Kanchuki/ }).count()).toBe(0)

  // Fire the real event now. `defaultPrevented` is the observable proof that
  // a listener was already attached at this point in the page's life.
  const prevented = await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)

  // The list resolves and the CTA appears — the event captured before mount
  // was not lost.
  await expect(page.getByText('Meera Sarees')).toBeVisible()
  const cta = page.getByRole('button', { name: /Add Kanchuki to your Home Screen/ })
  await expect(cta).toBeVisible()
})

test('dismissing the CTA sticks, and it does not come back on reload', async ({ page }) => {
  await page.route('**/api/passport/stores', async (route) => {
    await route.continue()
  })

  await page.goto('/my-stores')
  await expect(page.getByText('Meera Sarees')).toBeVisible()

  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }))
  })

  const cta = page.getByRole('button', { name: /Add Kanchuki to your Home Screen/ })
  await expect(cta).toBeVisible()

  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(cta).toHaveCount(0)
  expect(
    await page.evaluate(() => window.localStorage.getItem('kanchuki:pwa-install-dismissed')),
  ).toBe('1')

  // Reload and offer the event again — the device preference must win.
  await page.reload()
  await expect(page.getByText('Meera Sarees')).toBeVisible()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }))
  })
  await expect(page.getByRole('button', { name: /Add Kanchuki to your Home Screen/ })).toHaveCount(0)
})

// ── 3. Signed-out + installability ────────────────────────────────

test('an installed-icon launch can log in and land back on the page it wanted', async ({
  page,
}) => {
  state.signedIn = false
  // Enter on a URL that has a query string, so the round trip has to preserve
  // it and not just the path.
  await page.goto('/my-stores?tab=orders')

  // The (shopper) layout guard owns this: unauthenticated visitors never reach
  // the list page, and are sent to the dedicated login route carrying the exact
  // URL they were trying to reach. Predicate rather than a glob — `?` is a
  // wildcard in Playwright URL globs, which would make this match almost
  // anything — and it compares the query string too, so a guard that dropped it
  // fails here rather than silently passing on a bare path match.
  await page.waitForURL(
    (u) =>
      u.pathname === '/login' && u.searchParams.get('return_to') === '/my-stores?tab=orders',
  )

  // The page's own empty state is NOT what an anonymous visitor sees…
  expect(await page.getByText("Please log in to see the stores you've visited.").count()).toBe(0)

  // …they get a real login surface. (Until this shipped, `return_to` pointed at
  // `/`, the retailer marketing page, which had nowhere to enter an OTP.)
  await expect(page.getByLabel(/whatsapp number/i)).toBeVisible()
  await page.getByLabel(/whatsapp number/i).fill('9876543210')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /send otp/i }).click()

  await page.getByLabel(/6-digit code/i).fill('123456')
  await page.getByRole('button', { name: /verify and continue/i }).click()

  // Back on the page they actually wanted — query string included — and signed
  // in. Landing here (rather than being bounced back to /login by the guard's
  // own session check) is the assertion that matters: a login that succeeds but
  // does not stick would fail on the very next line. The `tab` check is what
  // proves the query survived the trip, since a bare `/my-stores` would satisfy
  // the pathname match on its own.
  await page.waitForURL((u) => u.pathname === '/my-stores' && u.searchParams.get('tab') === 'orders')
  await expect(page.getByRole('heading', { name: 'My Stores' })).toBeVisible()
  await expect(page.getByText('Meera Sarees')).toBeVisible()
  expect(await page.getByLabel(/whatsapp number/i).count()).toBe(0)

  // Both halves of the flow really went through the API.
  expect(state.requests).toContain('POST /v1/public/passport/otp/send')
  expect(state.requests).toContain('POST /v1/public/passport/otp/verify')
})

test('a hostile return_to cannot send the shopper off-origin', async ({ page }) => {
  state.signedIn = false
  // Exactly what an attacker would hand a shopper: an absolute URL in the
  // parameter the guard controls.
  await page.goto(`/login?return_to=${encodeURIComponent('https://evil.example/phish')}`)

  await page.getByLabel(/whatsapp number/i).fill('9876543210')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /send otp/i }).click()
  await page.getByLabel(/6-digit code/i).fill('123456')
  await page.getByRole('button', { name: /verify and continue/i }).click()

  await page.waitForURL((u) => u.pathname === '/my-stores')

  // Still on our own origin — never evil.example. The invalid target is
  // discarded and the shopper lands on the safe default instead.
  const landed = new URL(page.url())
  expect(landed.hostname).toBe('localhost')
  expect(landed.origin).not.toContain('evil.example')
  expect(landed.pathname).toBe('/my-stores')
})

test('a shopper whose session expires mid-flight is bounced, never shown a partial list', async ({
  page,
}) => {
  // /me succeeds (so the layout guard passes) but the visits call 401s —
  // the only way the page's own anonymous branch is reachable.
  state.storesAuthorized = false
  await page.goto('/my-stores')

  await expect(page.getByText("Please log in to see the stores you've visited.")).toBeVisible()
  expect(await page.locator('ul li a').count()).toBe(0)
  expect(await page.getByText('Meera Sarees').count()).toBe(0)
})

test('the production build meets the installability prerequisites (valid manifest + active SW)', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await page.goto('/my-stores')
  await expect(page.getByRole('heading', { name: 'My Stores' })).toBeVisible()

  // The SW must be active for Chrome to consider the page installable.
  const swState = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker?.ready.then((reg) => (reg.active ? 'active' : 'no-active')),
      // First-visit install precaches the whole app shell; 5s was a coin flip on
      // a loaded CI runner (passed and failed on identical code).
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 25_000)),
    ]),
  )
  expect(swState).toBe('active')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')

  const manifest = await cdp.send('Page.getAppManifest')
  expect(manifest.errors ?? []).toHaveLength(0)
  // Whitespace-agnostic: the exact JSON spacing Chrome returns is not ours to
  // depend on.
  expect(String(manifest.data)).toMatch(/"start_url"\s*:\s*"\/my-stores"/)

  // Chrome's own installability verdict — the exact gate on the real
  // beforeinstallprompt. `in-incognito` is the harness, not the build:
  // Playwright drives an incognito-like context, and Chrome never offers
  // installation there. Any OTHER error id is a real regression in the
  // shipped build (missing icons, bad start_url, no fetch handler), so it
  // still fails the test.
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  const realErrors = installabilityErrors.filter((e) => e.errorId !== 'in-incognito')
  console.log(
    '[installability] Chrome reports:',
    installabilityErrors.length === 0
      ? 'installable (no errors)'
      : JSON.stringify(
          installabilityErrors.map((e) => e.errorId),
          null,
          2,
        ),
  )
  expect(realErrors).toEqual([])

  await cdp.detach()
})

// RC-026: the consent control on this page called a proxy verb that did not
// exist, so every toggle answered 405 — and `fetch` does not throw on a 405, so
// the checkbox stayed off and silently came back on the next load. The
// heading-level layout checks below passed the entire time, which is why this
// asserts the request arriving at the API rather than the checkbox's own state:
// a control that only looks switched is the failure mode, not a missing control.
test('the personalization opt-out reaches the API instead of failing silently', async ({
  page,
}) => {
  await page.goto('/my-profile')

  const toggle = page.getByRole('checkbox', { name: 'Personalized recommendations' })
  await expect(toggle).toBeChecked()

  await toggle.uncheck()

  // Polled, not sampled: the proxy answers the browser before the upstream
  // request is recorded, so an immediate read races the assertion.
  await expect
    .poll(() => state.requests.filter((r) => r === 'PUT /v1/public/passport/preferences').length, {
      message:
        'the opt-out never reached the API — the passport proxy has no PUT verb for /preferences',
    })
    .toBeGreaterThan(0)

  // And it stays off, rather than rolling back the way it would on a failure.
  await expect(toggle).not.toBeChecked()
})

// ── Phone + tablet: the catalog a row actually opens ──────────────
//
// Everything above runs at the default desktop viewport, but these two pages are
// what a shopper opens from a shared WhatsApp link or the installed icon, on a
// phone — and the storefront deliberately serves tablet widths too. A layout
// that only holds at desktop is invisible to every other test in this file, so
// each size asserts the real content renders, that nothing spills sideways (a
// horizontally scrolling storefront on a phone is the failure shoppers report
// as "the site is broken"), that the rows stay tappable with a thumb, and that
// the console stayed clean — `pageerror` alone misses hydration mismatches and
// rejected fetches, which are the failures a green layout check would wave
// through.
for (const vp of VIEWPORTS) {
  test(`the store list holds up on ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    const client = watchClientErrors(page)

    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/my-stores')

    await expect(page.getByRole('heading', { name: 'My Stores' })).toBeVisible()
    const row = page.locator(`ul li a[href="/${STORE_SLUG}"]`)
    await expect(row).toBeVisible()

    await expectNoHorizontalOverflow(page, `the store list on ${vp.name}`)

    // The whole point of this page is tapping a row: a row that renders but is
    // a 20px sliver is unusable on the device it exists for. 44px is the
    // touch-target floor the mobile work in this repo already holds to.
    const box = await row.boundingBox()
    expect(box, 'the store row has no layout box').not.toBeNull()
    expect(box!.height, `the store row on ${vp.name} is ${box!.height}px tall`).toBeGreaterThanOrEqual(
      44,
    )

    // The un-published store still says so, rather than vanishing at this size.
    await expect(page.getByText("This store hasn't published a catalog page yet.")).toBeVisible()
    client.expectClean(`the store list on ${vp.name}`)
  })

  test(`the profile page holds up on ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    const client = watchClientErrors(page)

    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/my-profile')

    // The shopper's own identity, resolved from the passport session — not an
    // empty shell wrapped around a loading state.
    await expect(page.getByRole('heading', { name: 'Ananya' })).toBeVisible()
    await expect(page.getByText('••••••9999')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your Style' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your Data' })).toBeVisible()

    await expectNoHorizontalOverflow(page, `the profile page on ${vp.name}`)

    // The style chips are this page's main control surface, and they are the
    // site's smallest interactive element (14px text in a 6px pad, against the
    // 40px pills elsewhere) — WCAG 2.2 AA asks for 24×24.
    const chip = page.getByRole('button', { name: 'Festive', exact: true })
    await expect(chip).toBeVisible()
    const box = await chip.boundingBox()
    expect(box, 'the style chip has no layout box').not.toBeNull()
    expect(box!.height, `the style chip on ${vp.name} is ${box!.height}px tall`).toBeGreaterThanOrEqual(
      24,
    )
    client.expectClean(`the profile page on ${vp.name}`)
  })

  test(`the catalog holds up on ${vp.name} (${vp.width}×${vp.height})`, async ({
    context,
    page,
  }) => {
    const client = watchClientErrors(page)
    // Without this the product photos fail to load and the grid is measured
    // with broken images in it — see support/images.ts.
    await stubFixtureImages(context)

    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`/${STORE_SLUG}`)

    // The store's real content renders at this size — products, not just the
    // store name banner.
    await expect(page.getByText('Festive Design 1')).toBeVisible()
    await expect(page.getByText('Festive Design 2')).toBeVisible()

    // The product photo is the widest fixed-width thing in a grid card, so it
    // is the most likely overflow source — and a broken image would hide that
    // while still passing every other check here.
    await expectRenderedImage(
      page.getByRole('img', { name: 'Festive Design 1', exact: true }).first(),
      `the first product photo on ${vp.name}`,
    )

    await expectNoHorizontalOverflow(page, `the catalog on ${vp.name}`)
    client.expectClean(`the catalog on ${vp.name}`)
  })
}
