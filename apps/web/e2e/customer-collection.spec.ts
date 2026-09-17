import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import type { Server } from 'node:http'
import { API_STUB_ORIGIN, closeStub, createStubServer, listenStub } from './support/api-stub'
import { stubFixtureImages } from './support/images'
import {
  VIEWPORTS,
  expectFullyInViewport,
  expectNoHorizontalOverflow,
  expectRenderedImage,
  watchClientErrors,
} from './support/responsive'
import type {
  PublicShowcaseDesign,
  PublicShowcaseDesignDetail,
} from '../src/app/[store]/designs/types'
import type { PublicCollection, PublicProduct, PublicProductDetail } from '@kanchuki/shared'

// Regression suite for the customer-facing PWA:
//
//  1. /{public_slug}/{collection-slug} collection pages render and all
//     interactions (product detail sheet, favorites, pagination) happen
//     client-side — no full reload. Legacy /c/{slug} and /store/{slug} links
//     redirect to these canonical URLs.
//  2. The Serwist service worker (apps/web/src/app/sw.ts) makes the pages
//     work offline: collection documents NetworkFirst, /api/* collection
//     proxies StaleWhileRevalidate, R2 product images CacheFirst, and
//     uncached navigations fall back to the precached /offline page.
//
// Run via playwright.customer.config.ts — it boots a dedicated `next build`
// + `next start` server on :3100 (the SW is always enabled in prod builds;
// a dev-mode server can't serve the precached JS/CSS chunks offline, so the
// page never hydrates). The offline caching rules under test are the same
// src/app/sw.ts code that ships to prod.
//
// Stub API: collection pages are server-rendered — fetchCollection() calls the
// API from inside `next start`, which Playwright's browser routing can't reach.
// This spec runs a tiny HTTP stub on :3001 (the URL NEXT_PUBLIC_API_URL is
// pinned to in the customer config) serving the public collections API shape.
// Browser-side fetches (product detail, images) are mocked with context.route,
// which — unlike page.route — does intercept service-worker requests.

// ── Canned collection data ────────────────────────────────────────
const PAGE_SIZE = 12
const PRODUCT_COUNT = 24 // 2 pages — lets the offline test exercise /api/c SWR caching

function makeProduct(i: number): PublicProduct {
  const n = i + 1
  return {
    id: `prod-${n}`,
    name: `Festive Design ${n}`,
    // paise; distinct per product so a price assertion could discriminate pages
    price_min: 49900 + n * 1000,
    price_max: 59900 + n * 1000,
    status: 'AVAILABLE',
    category: 'Anarkali Suit',
    subtype: 'Festive Kurti',
    primary_color: 'Maroon',
    is_new_arrival: n <= 3,
    on_sale: n % 2 === 0,
    location: null,
    // Host matches the SW's `*.r2.dev` CacheFirst matcher so photos actually
    // get cached and survive an offline reload (asserted via naturalWidth).
    primary_photo_url: `https://cdn-e2e.r2.dev/design-${n}.jpg`,
    has_360: false,
    avg_rating: 0,
    rating_count: 0,
  }
}

const ALL_PRODUCTS = Array.from({ length: PRODUCT_COUNT }, (_, i) => makeProduct(i))

const STORE_SLUG = 'meera-sarees'

function collectionFor(slug: string, page: number): PublicCollection {
  const start = (page - 1) * PAGE_SIZE
  return {
    retailer: {
      id: 'retailer-meera',
      shop_name: 'Meera Sarees',
      city: 'Jaipur',
      phone: '919999999999',
      logo_url: null,
      banner_url: null,
      // Canonical URL scheme: /{public_slug}/{collection-slug}. The legacy
      // /c/{slug} and /store/{slug} pages 302 to these canonical paths.
      public_slug: STORE_SLUG,
      latitude: null,
      longitude: null,
    },
    title: slug === 'office-edit' ? 'Office Edit' : 'Festive Edit',
    description: 'A handpicked edit from the store.',
    expires_at: null,
    products: ALL_PRODUCTS.slice(start, start + PAGE_SIZE),
    total: PRODUCT_COUNT,
    page,
    page_size: PAGE_SIZE,
    filters: {
      categories: [{ value: 'Anarkali Suit', count: PRODUCT_COUNT }],
      colors: [{ value: 'Maroon', count: PRODUCT_COUNT }],
    },
  }
}

const KNOWN_SLUGS = new Set(['festive-edit', 'office-edit'])

// Suits Designs fixtures. Typed against the storefront pages' own contract so a
// field rename fails `tsc` here rather than leaving this spec green against a
// shape the app no longer accepts (the RC-008 class).
const DESIGNS: PublicShowcaseDesign[] = [
  {
    id: 'design-1',
    name: 'Festive Lehenga',
    image_url: 'https://cdn-e2e.r2.dev/design-a.jpg',
    category: { slug: 'suits', name: 'Suits' },
    store: { shop_name: 'Meera Sarees', slug: STORE_SLUG },
  },
  {
    id: 'design-2',
    name: 'Office Kurti',
    image_url: 'https://cdn-e2e.r2.dev/design-b.jpg',
    category: { slug: 'kurtis', name: 'Kurtis' },
    store: { shop_name: 'Meera Sarees', slug: STORE_SLUG },
  },
]

const DESIGN_DETAIL: PublicShowcaseDesignDetail = {
  ...DESIGNS[0]!,
  created_at: '2026-09-01T10:00:00.000Z',
}

// ── Stub API server (serves SSR fetches inside `next start`) ─────
let apiStub: Server | null = null

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const url = new URL(req.url ?? '/', API_STUB_ORIGIN)
    const collectionMatch = url.pathname.match(/^\/v1\/public\/collections\/([^/]+)$/)
    const favoriteMatch = url.pathname.match(/^\/v1\/public\/collections\/([^/]+)\/favorite$/)
    const retailerMatch = url.pathname.match(/^\/v1\/public\/retailers\/([^/]+)$/)
    res.setHeader('Content-Type', 'application/json')

    // Store profile — /{public_slug} contact gate (canonical form of the
    // legacy /store/{public_slug} QR links).
    if (req.method === 'GET' && retailerMatch && retailerMatch[1] === STORE_SLUG) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          data: {
            shop_name: 'Meera Sarees',
            city: 'Jaipur',
            state: null,
            address_line1: null,
            address_line2: null,
            categories: [],
            logo_url: null,
            banner_url: null,
            storefront_slug: 'festive-edit',
          },
        }),
      )
      return
    }

    if (req.method === 'POST' && favoriteMatch) {
      res.statusCode = 200
      res.end(JSON.stringify({ data: { ok: true } }))
      return
    }
    // View tracking (RC-025) — the page's fire-and-forget ping, which now has a
    // web proxy route to reach this endpoint through.
    if (req.method === 'POST' && /^\/v1\/public\/collections\/[^/]+\/view$/.test(url.pathname)) {
      res.statusCode = 204
      res.end()
      return
    }

    // Promotions — the storefront's PromotionBanner fetches
    // `/api/{store}/promotions`, which proxies to this upstream. Unstubbed it
    // answers 404, which the console check reports as a page error.
    if (req.method === 'GET' && /^\/v1\/public\/retailers\/[^/]+\/promotions$/.test(url.pathname)) {
      res.statusCode = 200
      res.end(JSON.stringify({ data: [] }))
      return
    }

    if (req.method === 'GET' && collectionMatch) {
      const slug = decodeURIComponent(collectionMatch[1])
      if (KNOWN_SLUGS.has(slug)) {
        const page = Number(url.searchParams.get('page') ?? '1')
        res.statusCode = 200
        res.end(JSON.stringify({ data: collectionFor(slug, page) }))
        return
      }
    }
    // The product sheet's two public reads. Both are real proxy routes
    // (`/api/reviews/product/[id]` and `/api/showcase-designs`) that pass the
    // upstream status straight through — so with no upstream here the browser
    // saw a 404 the app handles, and the console check reported it.
    if (req.method === 'GET' && /^\/v1\/public\/reviews\/product\/[^/]+$/.test(url.pathname)) {
      res.statusCode = 200
      res.end(JSON.stringify({ data: [] }))
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/public/showcase-designs') {
      // Two different shapes share this endpoint, told apart by the query:
      //   ?product_id= — the product-detail strip, which reads designs+category
      //   ?store=      — the store-scoped browse feed (/{store}/designs)
      // The browse feed gets real rows so the grid renders rather than the
      // empty state, which is the layout that actually has to hold up.
      const data = url.searchParams.get('product_id')
        ? { designs: [], category: null }
        : { designs: DESIGNS, related: [], next_cursor: null }
      res.statusCode = 200
      res.end(JSON.stringify({ data }))
      return
    }

    // Permalink — /{store}/designs/{id} renders from the detail row.
    if (req.method === 'GET' && url.pathname === `/v1/public/showcase-designs/${DESIGN_DETAIL.id}`) {
      res.statusCode = 200
      res.end(JSON.stringify({ data: DESIGN_DETAIL }))
      return
    }

    res.statusCode = 404
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found', status: 404 } }))
  })

  await listenStub(apiStub)
})

test.afterAll(async () => {
  await closeStub(apiStub)
})

// ── Browser-side mocks (context.route intercepts SW requests too) ─
// A realistic 64×80 RGB PNG. The old 1×1 transparent PNG hits a Chromium
// quirk with Next.js <Image> under srcset+sizes: the element reports
// naturalWidth 0 even though the bytes decode fine (DIAG5 proved src-only
// loads give naturalWidth 1, srcset ones 0). A real-size image avoids it.
const PRODUCT_DETAIL: PublicProductDetail = {
  ...ALL_PRODUCTS[0],
  secondary_colors: [],
  fabric_estimate: 'Raw Silk',
  description: 'Elegant maroon silk suit with gold zari embroidery, ideal for festive occasions.',
  search_tags: ['maroon', 'festive'],
  sizes: ['S', 'M', 'L', 'XL'],
  photos: [ALL_PRODUCTS[0].primary_photo_url],
  spin_frames: [],
  variants: [
    { color: 'Maroon', photo_url: null, status: 'AVAILABLE' },
    { color: 'Teal', photo_url: 'https://cdn-e2e.r2.dev/variant-teal.jpg', status: 'AVAILABLE' },
  ],
}

async function mockBrowserNetwork(context: BrowserContext): Promise<void> {
  // Product detail sheet data — /api/products/[id] and /api/products/[id]/related
  // (same-origin Next routes that 404 without a backend; the sheet degrades
  // gracefully but the mocked detail lets us assert sizes + color variants).
  await context.route('**/api/products/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/related')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [ALL_PRODUCTS[1], ALL_PRODUCTS[2]] }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: PRODUCT_DETAIL }),
      })
    }
  })

  // Product photos — shared with the other specs so the fixture host is never
  // left unserved, on either path (see support/images.ts). The optimizer
  // response is cached by the SW's defaultCache image entry
  // (destination === 'image', CacheFirst) and served from cache on the offline
  // reload.
  await stubFixtureImages(context)
}

// Sentinel that only survives client-side navigation (wiped by a full reload)
type TestWindow = Window & { __e2eSentinel?: string }

async function pinSentinel(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as TestWindow).__e2eSentinel = 'alive'
  })
}

async function sentinelIsAlive(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as TestWindow).__e2eSentinel === 'alive')
}

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 20_000 },
  )
}

// ── Tests ─────────────────────────────────────────────────────────

test('collection page renders and interactions are client-side (no full reload)', async ({
  context,
  page,
}) => {
  await mockBrowserNetwork(context)

  let loadCount = 0
  page.on('load', () => {
    loadCount += 1
  })

  await page.goto(`/${STORE_SLUG}/festive-edit`)
  // The Discovery redesign renders the collection title as a summary line
  // ("{title} · {total} curated items"), not a heading element — assert on the
  // SSR'd text, which is exactly what an offline reload serves from cache.
  await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
  await expect(page.getByText('Meera Sarees · Jaipur')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()
  expect(loadCount).toBe(1)

  await pinSentinel(page)

  // Pagination — client-side fetch through the /api/c proxy
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Festive Design 13', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeHidden()
  expect(loadCount).toBe(1)

  await page.getByRole('button', { name: 'Prev', exact: true }).click()
  await expect(page.getByText('Page 1 of 2')).toBeVisible()

  // Favorite a product — updates the sticky bar count without a reload.
  // exact: true is required: the card photo div has role="button" and its
  // accessible name is "Festive Design 1 Add to favorites" (img alt + nested
  // button label), so substring matching resolves .first() to the photo div
  // (which opens the sheet) instead of the heart button.
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).first().click()
  // The Discovery redesign removed the sticky "Selected (N)" favorites bar —
  // the heart flipping to "Remove from favorites" is the on-page feedback now.
  await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true }).first()).toBeVisible()
  expect(loadCount).toBe(1)

  // Open the product detail sheet (lazy-loaded, client-side)
  await page.getByRole('img', { name: 'Festive Design 1', exact: true }).click()
  // Sheet probe: the sheet's enquiry CTA is "Enquire Now" — the fixed bottom
  // nav has a bare "Enquire" button that is always visible, so only the
  // "Enquire Now" exact match proves the sheet is open (and its teardown on
  // close below). Mocked detail data: fabric row + color variants. The
  // Discovery redesign removed size chips from the sheet — "Available Sizes"
  // now lives on the full product page (SharedProductPage), which this suite
  // doesn't route to.
  await expect(page.getByRole('button', { name: 'Enquire Now', exact: true })).toBeVisible()
  await expect(page.getByText('Raw Silk')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Teal', exact: true })).toBeVisible()
  expect(loadCount).toBe(1)

  // Close the sheet — back to the grid, still no reload
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enquire Now', exact: true })).toBeHidden()
  await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()
  expect(loadCount).toBe(1)
  expect(await sentinelIsAlive(page)).toBe(true)
})

test('collection pages work offline via the service worker', async ({ context, page }) => {
  await mockBrowserNetwork(context)

  // 1. Online visit — SW installs and claims the page
  await page.goto(`/${STORE_SLUG}/festive-edit`)
  await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
  await waitForServiceWorkerControl(page)

  // 2. SW-controlled reload — NetworkFirst caches this document; the images
  //    (CacheFirst, *.r2.dev) are fetched through the SW and cached too.
  await page.reload()
  await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
  await page.waitForFunction(() => {
    const img = document.querySelector('img[alt="Festive Design 1"]') as HTMLImageElement | null
    return img !== null && img.complete && img.naturalWidth > 0
  })

  // 3. Prime the /api/c StaleWhileRevalidate cache: paginate to page 2 online
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()

  // Assert the precondition this test silently assumed: the /offline document
  // is actually in the precache. Without it, a missed install-time precache
  // shows up as a 15s "element not found" timeout at step 7 instead of a
  // failure that names the real cause.
  await expect
    .poll(async () => page.evaluate(() => caches.match('/offline').then((r) => r !== undefined)), {
      timeout: 10_000,
      message: '/offline was never precached — the SW install did not complete',
    })
    .toBe(true)

  // ── Go offline ──
  await context.setOffline(true)

  // 4. Reload the cached page — NetworkFirst serves the cached document
  await page.reload()
  await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()

  // 5. Photos come from the product-images cache (CacheFirst), not the network
  //    — wait for the image to actually finish loading from the SW cache.
  await page.waitForFunction(() => {
    const img = document.querySelector('img[alt="Festive Design 1"]') as HTMLImageElement | null
    return img !== null && img.complete && img.naturalWidth > 0
  })

  // 6. Paginate offline — /api/c SWR cache serves the last-known page 2
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Festive Design 13', exact: true })).toBeVisible()

  // 7. The offline fallback document is the real offline page.
  //
  // /offline is precached at install (asserted above), so this reads the cached
  // copy the worker will serve without touching the network. Asserting the
  // cached document — rather than navigating to it — is deliberate: see the note
  // after this test for why an offline navigation cannot be asserted
  // deterministically from Playwright.
  await context.setOffline(true)
  const offlineHtml = await page.evaluate(async () => {
    const cached = await caches.match('/offline')
    return cached ? await cached.text() : null
  })
  expect(offlineHtml).toContain("You're offline")
})

// Deliberately NOT asserted above: that an *uncached* navigation falls back to
// /offline. The navigation to /c/never-visited was written that way and is the
// test that failed CI on runs 34618428005 and 34605780395 (and ~1-in-3 locally).
// It cannot be made deterministic from Playwright today:
//
//  · context.setOffline(true) cuts the page's network but NOT the worker's. A
//    trace showed the worker still getting a real 307 for /c/never-visited from
//    the running `next start`, following it, and serving the cached collection
//    page instead of the fallback.
//  · Stubbing the worker's global fetch() and disabling navigationPreload (the
//    browser's second, independent path for document navigations) still lost
//    roughly a third of runs. Instrumentation showed why the response could not
//    be the worker's own doing: on the failing runs caches.match('/c/never-
//    visited') was a MISS and fetch was stubbed, yet the page still rendered the
//    collection page — i.e. the response came from Chromium's handling of the
//    SW-controlled navigation, not from the worker's routing or its caches.
//
// So this suite asserts the parts it can hold: a cached document reloads
// offline, images come from the SW cache, SWR-served pagination works offline,
// and the /offline fallback document is precached and renders. The uncached-
// navigation fallback needs a way to cut the worker's network deterministically
// (or a unit-level test of the serwist fallback config) before it can be
// re-added.

test('legacy /c/{slug} and /store/{slug} links redirect to canonical URLs', async ({
  context,
  page,
}) => {
  await mockBrowserNetwork(context)

  // Collection link shared before the canonical scheme: /c/{slug} → /{store}/{slug}.
  await page.goto('/c/festive-edit')
  await expect(page).toHaveURL(`/${STORE_SLUG}/festive-edit`)
  await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()

  // Store QR link shared before the canonical scheme: /store/{slug} → /{slug}.
  await page.goto(`/store/${STORE_SLUG}`)
  await expect(page).toHaveURL(`/${STORE_SLUG}`)
  await expect(page.getByRole('heading', { name: 'Meera Sarees', exact: true })).toBeVisible()
})

// ── Phone + tablet ────────────────────────────────────────────────
// The collection page is where a shared WhatsApp link lands, and the product
// sheet is how a shopper on a phone actually looks at an item — so both are
// sized for a thumb here, not only for the desktop the other tests use. The
// sheet matters most: it's a fixed overlay, which is the one place a control can
// render off-screen and leave the shopper stuck with no way back.
//
// The legacy-redirect and Suits-Designs surfaces below are sized in the same
// loop for the same reason: they are reached from a shared link on a phone,
// and a redirect that lands on something unusable is indistinguishable from a
// broken link to the person holding it.
for (const vp of VIEWPORTS) {
  test(`a legacy /c/{slug} link lands on a usable catalog on ${vp.name}`, async ({
    context,
    page,
  }) => {
    const client = watchClientErrors(page)
    await mockBrowserNetwork(context)
    await page.setViewportSize({ width: vp.width, height: vp.height })

    await page.goto('/c/festive-edit')
    await expect(page).toHaveURL(`/${STORE_SLUG}/festive-edit`)

    // The part a desktop-only redirect test never reaches: the page it lands on
    // has to render its content at this size too.
    await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page, `the redirected collection on ${vp.name}`)
    client.expectClean(`the redirected collection on ${vp.name}`)
  })

  test(`the designs browser and a design permalink hold up on ${vp.name}`, async ({
    context,
    page,
  }) => {
    const client = watchClientErrors(page)
    await mockBrowserNetwork(context)
    await page.setViewportSize({ width: vp.width, height: vp.height })

    await page.goto(`/${STORE_SLUG}/designs`)
    await expect(page.getByRole('heading', { name: 'Meera Sarees Designs' })).toBeVisible()
    // A real card from the feed, not the empty state — this is a 2-col grid on
    // phones, and its 3:4 tiles are what could push the page sideways.
    const card = page.locator(`a[href="/${STORE_SLUG}/designs/design-1"]`)
    await expect(card).toBeVisible()
    const tile = page.getByRole('img', { name: 'Festive Lehenga', exact: true })
    await expect(tile).toBeVisible()
    // Rendered pixels, not just a visible box — see expectRenderedImage.
    await expectRenderedImage(tile, `the design tile on ${vp.name}`)
    await expectNoHorizontalOverflow(page, `the designs browser on ${vp.name}`)

    // The permalink is a shareable link in its own right (`/{store}/designs/{id}`),
    // so it has to stand up reached directly rather than only by tapping through.
    await page.goto(`/${STORE_SLUG}/designs/design-1`)
    // exact: the permalink footer also says "Shared via Kanchuki — design
    // inspiration for your…", so a substring match resolves to two elements.
    await expect(page.getByText('Design inspiration', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to designs' })).toBeVisible()
    // This page renders the watermarked file with a plain <img> on purpose, so
    // the optimiser never re-encodes it — meaning it is the one surface that
    // requests the fixture host directly rather than through /_next/image.
    // Asserting decoded pixels is what keeps both paths served.
    await expectRenderedImage(
      page.getByRole('img', { name: 'Festive Lehenga', exact: true }),
      `the design permalink photo on ${vp.name}`,
    )
    await expectNoHorizontalOverflow(page, `the design permalink on ${vp.name}`)
    client.expectClean(`the designs pages on ${vp.name}`)
  })
}

for (const vp of VIEWPORTS) {
  test(`the collection and its product sheet hold up on ${vp.name}`, async ({ context, page }) => {
    const client = watchClientErrors(page)
    await mockBrowserNetwork(context)
    await page.setViewportSize({ width: vp.width, height: vp.height })

    await page.goto(`/${STORE_SLUG}/festive-edit`)
    await expect(page.getByText('Festive Edit · 24 curated items', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page, `the collection on ${vp.name}`)

    await page.getByRole('img', { name: 'Festive Design 1', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Enquire Now', exact: true })).toBeVisible()
    await expect(page.getByText('Raw Silk')).toBeVisible()

    // The close control has to be on screen the moment the sheet opens — a
    // shopper who cannot see the way out of a fixed overlay is stuck.
    const closer = page.getByRole('button', { name: 'Close', exact: true })
    await expectFullyInViewport(closer, `the sheet's close button on ${vp.name}`)
    await expectNoHorizontalOverflow(page, `the collection with the sheet open on ${vp.name}`)

    // The enquiry CTA is the last block inside the sheet's scrolling body, so on
    // a phone it starts below the fold (measured: bottom edge ~892px against a
    // 844px viewport). That is a long scroll, not a dead end — but "it's inside
    // an overflow-y-auto div" is a claim about CSS, and this asserts the thing
    // that actually matters: it can be brought fully into view, the way a shopper
    // does it, by scrolling the sheet rather than the page.
    const cta = page.getByRole('button', { name: 'Enquire Now', exact: true })
    await cta.scrollIntoViewIfNeeded()
    await expectFullyInViewport(cta, `the sheet's enquiry CTA on ${vp.name} after scrolling`)
    await expectNoHorizontalOverflow(page, `the sheet scrolled to the CTA on ${vp.name}`)

    // …and it tears down, leaving the grid usable rather than a dead overlay.
    await closer.click()
    await expect(page.getByRole('button', { name: 'Enquire Now', exact: true })).toBeHidden()
    await expect(page.getByRole('img', { name: 'Festive Design 1', exact: true })).toBeVisible()
    client.expectClean(`the collection on ${vp.name}`)
  })
}

