import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SharedProductPageRoute from '../page'

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the alt text (same as the
// CollectionView test).
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt?: string | null
    className?: string
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
  }) => <img src={src} alt={alt ?? ''} className={className} />,
}))

// Pin the API base so the outbound fetch URLs are deterministic (no reliance
// on real env vars in tests) — same pattern as sitemap.test.ts.
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}))

const fetchMock = vi.fn()

// A shared-product URL whose collection segment is a browse-page pseudo-slug
// (all-{store} / cat-{categoryId}). CollectionView passes the browse slug into
// the product sheet's share button, so these are the URLs customers actually
// forward on WhatsApp from the "All Products" / category pages. They must
// resolve (via resolveStorefront) instead of 404ing.
const fetchRoutes: Record<string, { status: number; body: unknown }> = {
  // Real collection fetch for "all-meera-sarees" → not a collection → 404,
  // which drives the route into the resolveStorefront fallback. Both the
  // route's fetchCollection (with params) and resolveStorefront's own
  // real-slug probe (bare URL) 404.
  'https://api.test.invalid/v1/public/collections/all-meera-sarees?page=1&pageSize=1': {
    status: 404,
    body: { error: 'Collection not found' },
  },
  'https://api.test.invalid/v1/public/collections/all-meera-sarees': {
    status: 404,
    body: { error: 'Collection not found' },
  },
  // resolveStorefront resolves the all-{store} pseudo-slug via the store's
  // product listing endpoint.
  'https://api.test.invalid/v1/public/retailers/meera-sarees/products': {
    status: 200,
    body: {
      data: {
        retailer: {
          shop_name: 'Meera Sarees',
          city: 'Jaipur',
          phone: '919999999999',
          logo_url: null,
          banner_url: null,
          public_slug: 'meera-sarees',
        },
        title: 'All Products',
        description: null,
        expires_at: null,
        products: [],
        total: 0,
        page: 1,
        page_size: 0,
        filters: { categories: [], colors: [] },
      },
    },
  },
  'https://api.test.invalid/v1/public/products/prod-1': {
    status: 200,
    body: {
      data: {
        id: 'prod-1',
        name: 'Maroon Anarkali Suit',
        price_min: 49900,
        price_max: 59900,
        is_new_arrival: false,
        on_sale: false,
        status: 'AVAILABLE',
        category: 'Anarkali Suit',
        primary_color: 'Maroon',
        fabric_estimate: 'Silk',
        description: 'A festive anarkali with hand embroidery.',
        sizes: ['M', 'L'],
        location: null,
        primary_photo_url: 'https://cdn-test.r2.dev/prod-1.jpg',
        has_360: false,
        avg_rating: 0,
        rating_count: 0,
        photos: ['https://cdn-test.r2.dev/prod-1.jpg'],
        spin_frames: [],
        variants: [],
      },
    },
  },
}

beforeEach(() => {
  localStorage.setItem('kanchuki_lead_meera-sarees', 'true')
  fetchMock.mockReset()
  fetchMock.mockImplementation((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : String(input)
    const route = fetchRoutes[url]
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`))
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('[store]/[collection]/product/[productId] shared product route', () => {
  it('resolves a pseudo-slug collection segment (all-{store}) instead of 404ing', async () => {
    const params = Promise.resolve({
      store: 'meera-sarees',
      collection: 'all-meera-sarees',
      productId: 'prod-1',
    })

    let result: React.ReactElement
    await expect(
      SharedProductPageRoute({ params }).then((el) => {
        result = el
        render(result!)
      }),
    ).resolves.toBeUndefined()

    // The product itself renders (name shows in the header + the info card).
    expect(screen.getAllByText('Maroon Anarkali Suit').length).toBeGreaterThan(0)
    // Both CTAs point at the real browse page (All Products), never the
    // pseudo-slug URL (which has no page behind it). Assert on hrefs — the
    // next/link mock drops aria-label, so the icon-only back link has no
    // accessible name.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/meera-sarees/all')
    // 2 header links (back + bag) + the "View Full Catalog" CTA.
    expect(hrefs.filter((h) => h === '/meera-sarees/all')).toHaveLength(3)
    expect(hrefs).not.toContain('/meera-sarees/all-meera-sarees')
  })

  it('resolves a cat-{categoryId} pseudo-slug via the category endpoint', async () => {
    const categoryUrl = 'https://api.test.invalid/v1/public/retailers/meera-sarees/categories/cat-1'
    fetchRoutes[categoryUrl] = {
      status: 200,
      body: {
        data: {
          retailer: {
            shop_name: 'Meera Sarees',
            city: 'Jaipur',
            phone: '919999999999',
            logo_url: null,
            banner_url: null,
            public_slug: 'meera-sarees',
          },
          title: 'Suits',
          description: null,
          expires_at: null,
          products: [],
          total: 0,
          page: 1,
          page_size: 0,
          filters: { categories: [], colors: [] },
        },
      },
    }
    // fetchCollection (with params) AND resolveStorefront's own real-slug
    // probe (bare URL) both 404 → pseudo-slug branch is taken.
    fetchRoutes['https://api.test.invalid/v1/public/collections/cat-cat-1?page=1&pageSize=1'] = {
      status: 404,
      body: { error: 'Collection not found' },
    }
    fetchRoutes['https://api.test.invalid/v1/public/collections/cat-cat-1'] = {
      status: 404,
      body: { error: 'Collection not found' },
    }

    const params = Promise.resolve({
      store: 'meera-sarees',
      collection: 'cat-cat-1',
      productId: 'prod-1',
    })

    await SharedProductPageRoute({ params }).then((el) => render(el))

    // Back link goes to the category browse page the customer was on.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/meera-sarees/categories/cat-1')
    expect(hrefs).not.toContain('/meera-sarees/categories/cat-cat-1')
  })
})
