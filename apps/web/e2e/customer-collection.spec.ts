import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
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

const API_STUB_PORT = 3001
// 127.0.0.1, not `localhost`, so the Next.js SSR fetch can't resolve to ::1
// and miss the IPv4-only stub listener (NEXT_PUBLIC_API_URL is pinned to this
// exact origin in playwright.customer.config.ts).
const API_STUB_ORIGIN = `http://127.0.0.1:${API_STUB_PORT}`

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

// ── Stub API server (serves SSR fetches inside `next start`) ─────
let apiStub: Server | null = null

test.beforeAll(async () => {
  apiStub = createServer((req, res) => {
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
    if (req.method === 'GET' && collectionMatch) {
      const slug = decodeURIComponent(collectionMatch[1])
      if (KNOWN_SLUGS.has(slug)) {
        const page = Number(url.searchParams.get('page') ?? '1')
        res.statusCode = 200
        res.end(JSON.stringify({ data: collectionFor(slug, page) }))
        return
      }
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found', status: 404 } }))
  })

  await new Promise<void>((resolve, reject) => {
    apiStub!.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${API_STUB_PORT} is in use — the customer e2e suite needs it free to stub the public API. Stop any dev server on :${API_STUB_PORT} and re-run.`,
          ),
        )
      } else {
        reject(err)
      }
    })
    apiStub!.listen(API_STUB_PORT, '127.0.0.1', resolve)
  })
})

test.afterAll(async () => {
  if (!apiStub) return
  await new Promise<void>((resolve) => {
    try {
      apiStub!.close(() => resolve())
    } catch {
      resolve() // never listened (beforeAll failed) — nothing to close
    }
  })
})

// ── Browser-side mocks (context.route intercepts SW requests too) ─
// A realistic 64×80 RGB PNG. The old 1×1 transparent PNG hits a Chromium
// quirk with Next.js <Image> under srcset+sizes: the element reports
// naturalWidth 0 even though the bytes decode fine (DIAG5 proved src-only
// loads give naturalWidth 1, srcset ones 0). A real-size image avoids it.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABQCAIAAAAm3eQSAAAAkElEQVR4nO3PUQkAIBTAwBfROEY0liH8OITBAtzmrP11wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AbehQdI93DrPAAAAAElFTkSuQmCC',
  'base64',
)

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

  // Product photos — Next.js <Image> proxies remote URLs through
  // /_next/image?url=..., so the browser never requests the r2.dev host
  // directly; mock the optimizer endpoint instead. The response is cached by
  // the SW's defaultCache image entry (destination === 'image', CacheFirst)
  // and served from cache on the offline reload.
  await context.route('**/_next/image*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG })
  })
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

  // 7. Uncached navigation offline — precached /offline fallback page
  await page.goto('/c/never-visited')
  await expect(page.getByRole('heading', { name: "You're offline", exact: true })).toBeVisible()
})

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

