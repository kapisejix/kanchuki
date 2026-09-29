import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { CollectionView } from '../CollectionView'
import type { PublicCollection } from '@kanchuki/shared'
import type { ReactNode } from 'react'

// Controllable pathname — mirrors the customer route-change keying. Unlike the
// admin shell (which keeps sidebar/header mounted and only swaps the keyed
// content area), the customer route keyed on pathname in app/c/[slug]/layout.tsx
// REMOUNTS the whole page subtree. Favorites survive that remount only because
// they're persisted to localStorage (loadWishlist/saveWishlist) and rehydrated
// on mount — that persistence guarantee is what this test locks in.
const nav = createControllablePathname('/c/festive-edit')

// ProductDetailSheet / TryOnModal are lazy-loaded via next/dynamic({ ssr: false });
// in jsdom that async boundary never resolves deterministically, so stub it out —
// this test locks the grid + favorites, not the detail sheet.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const LazyStub = () => null
    return LazyStub
  },
}))

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the alt text.
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

function makeProduct(i: number): PublicCollection['products'][number] {
  return {
    id: `prod-${i}`,
    name: `Festive Design ${i}`,
    price_min: 49900 + i * 1000,
    price_max: 59900 + i * 1000,
    status: 'AVAILABLE',
    category: 'Anarkali Suit',
    subtype: 'Festive Kurti',
    primary_color: 'Maroon',
    is_new_arrival: i < 3,
    on_sale: i % 2 === 0,
    location: null,
    primary_photo_url: `https://cdn-test.r2.dev/design-${i}.jpg`,
    has_360: false,
    avg_rating: 0,
    rating_count: 0,
  }
}

const COLLECTION: PublicCollection = {
  retailer: {
    id: 'retailer-meera',
    shop_name: 'Meera Sarees',
    city: 'Jaipur',
    phone: '919999999999',
    logo_url: null,
    banner_url: null,
    public_slug: 'meera-sarees',
    latitude: null,
    longitude: null,
  },
  title: 'Festive Edit',
  description: 'A handpicked edit from the store.',
  expires_at: null,
  products: [makeProduct(1), makeProduct(2), makeProduct(3)],
  total: 3,
  page: 1,
  page_size: 12,    filters: {
      categories: [{ value: 'Anarkali Suit', count: 3 }],
      colors: [{ value: 'Maroon', count: 3 }],
      sizes: [{ value: 'M', count: 4 }, { value: 'L', count: 2 }],
    },

}

// Mirrors app/c/[slug]/layout.tsx's route-change keying: the page subtree is
// keyed on usePathname, so a route change REMOUNTS it (component state resets;
// only persisted state survives). Deliberately a plain keyed div rather than
// the real AnimatePresence wrapper — framer-motion's exit animation doesn't
// resolve deterministically in jsdom, and the remount semantics are what this
// test asserts.
function RouteKeyedHarness({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} data-testid="route-keyed">
      {children}
    </div>
  )
}

describe('CollectionView favorites survive a client-side route change', () => {
  beforeEach(() => {
    nav.reset()
    localStorage.clear()
    // CollectionView fire-and-forgets the view track + the favorite POST — both
    // must resolve for the assertions to be deterministic. (The checkout-status
    // probe is gone; its route was deleted with checkout — RC-025.)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const pageElement = (pathname: string) => {
    nav.setPathname(pathname)
    return (
      <RouteKeyedHarness>
        <CollectionView
          collection={COLLECTION}
          slug="festive-edit"
          productsApiPath="/api/c/festive-edit/products"
        />
      </RouteKeyedHarness>
    )
  }

  it('rehydrates favorites from localStorage after a route-change remount', () => {
    const { rerender } = render(pageElement('/c/festive-edit'))
    expect(screen.getByText(/Festive Edit ·/)).toBeInTheDocument()

    // Favorite product 1. The card photo div also has role="button" with the
    // accessible name "Festive Design 1 Add to favorites" (img alt + nested
    // heart label), so the name must be anchored exactly with a regex — plain
    // string matching would hit the photo div first.
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Add to favorites$/ })[0],
    )
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(localStorage.getItem('kanchuki_wishlist_festive-edit')).toContain('prod-1')

    // Capture the keyed wrapper so we can prove a real remount happens (a
    // route change must NOT be an in-place re-render of the same page).
    const wrapperBefore = document.querySelector('[data-testid="route-keyed"]')
    expect(wrapperBefore).not.toBeNull()

    // Client-side route change: /c/festive-edit → /c/festive-edit/wishlist.
    // No full reload — just the pathname changing, which rekeys the wrapper
    // and remounts the page subtree (component state resets; only persisted
    // state survives). rerender() updates the SAME root — a second render()
    // call would mount a parallel tree and make every query ambiguous.
    rerender(pageElement('/c/festive-edit/wishlist'))

    // The remount actually happened
    expect(document.querySelector('[data-testid="route-keyed"]')).not.toBe(wrapperBefore)

    // Favorites survived the remount via localStorage rehydration: the sticky
    // bar count is back to 1 and product 1's heart is still filled.
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Remove from favorites$/ }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('kanchuki_wishlist_festive-edit')).toContain('prod-1')
  })
})

// F-037 §2 row 5 — real social-proof chips. Two properties matter, and both are
// load-bearing for the honesty rule: one request covers the whole grid (not one
// per card), and only the products the API returned a real count for get a chip
// at all — an absent entry renders nothing, never "0 viewed".
describe('CollectionView pagination', () => {
  const paginatedCollection = (page = 1, total = 40): PublicCollection => ({
    ...COLLECTION,
    products: Array.from({ length: 20 }, (_, i) => makeProduct((page - 1) * 20 + i + 1)),
    total,
    page,
    page_size: 20,
    filters: {
      ...COLLECTION.filters,
      sizes: [{ value: 'M', count: 4 }, { value: 'L', count: 2 }],
    },
  })


  const pageResponse = (page: number, total = 40) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: paginatedCollection(page, total) }),
  })

  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('changes page only via Prev/Next, each replacing the grid — scrolling loads nothing', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input), 'https://kanchuki.test')
      if (url.pathname.endsWith('/products')) return pageResponse(Number(url.searchParams.get('page')))
      if (url.pathname.startsWith('/api/engagement-chips')) {
        return { ok: true, status: 200, json: async () => ({ data: { products: {}, window: {} } }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const productRequests = () =>
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input), 'https://kanchuki.test'))
        .filter((url) => url.pathname.endsWith('/products'))

    render(
      <CollectionView
        collection={paginatedCollection()}
        slug="festive-edit"
        productsApiPath="/api/c/festive-edit/products"
      />,
    )
    expect(await screen.findByText('Festive Design 20')).toBeInTheDocument()

    // Owner decision 2026-09-29: no append-on-scroll. The page is within 500px
    // of the bottom (beforeEach), which is where the removed listener fired.
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(productRequests()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Festive Design 40')).toBeInTheDocument()
    expect(screen.queryByText('Festive Design 1')).not.toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(productRequests()[0]?.searchParams.get('pageSize')).toBe('20')

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
    expect(await screen.findByText('Festive Design 1')).toBeInTheDocument()
    expect(screen.queryByText('Festive Design 40')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('shows size chips and sends the selected size as a replace request', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input), 'https://kanchuki.test')
      if (url.pathname.endsWith('/products')) return pageResponse(Number(url.searchParams.get('page')))
      if (url.pathname.startsWith('/api/engagement-chips')) {
        return { ok: true, status: 200, json: async () => ({ data: { products: {}, window: {} } }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <CollectionView
        collection={paginatedCollection()}
        slug="festive-edit"
        productsApiPath="/api/c/festive-edit/products"
      />,
    )

    expect(screen.getByRole('group', { name: 'Filter by size' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'M (4)' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), 'https://kanchuki.test')
        return url.pathname.endsWith('/products') && url.searchParams.get('size') === 'M'
      })).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'M (4)' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CollectionView social-proof chips', () => {
  const DAY_MS = 86_400_000
  const isoDaysAgo = (days: number) =>
    new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)

  const CHIPS_URL = '/api/engagement-chips?store=meera-sarees'

  // prod-1 has a real count; prod-2 and prod-3 have none.
  function stubFetch() {
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/engagement-chips')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              products: { 'prod-1': { viewed_today: 8, favorited_week: 3 } },
              // The nightly rollup summarizes completed days — the newest window
              // is yesterday, which is what the chip label must reflect.
              window: {
                today: isoDaysAgo(1),
                week_from: isoDaysAgo(7),
                week_to: isoDaysAgo(1),
              },
            },
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches once for the grid and chips only the products the API returned', async () => {
    const fetchMock = stubFetch()
    render(
      <CollectionView
        collection={COLLECTION}
        slug="festive-edit"
        store="meera-sarees"
        productsApiPath="/api/meera-sarees/festive-edit/products"
      />,
    )

    // prod-1's real count, labelled from the window the API reported — the
    // favourite count wins over the view count when both exist.
    expect(await screen.findByText('3 saved this week')).toBeInTheDocument()

    // One request for all three products — not one per card.
    const chipRequests = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/api/engagement-chips'))
    expect(chipRequests).toEqual([CHIPS_URL])

    // prod-2 and prod-3 had no entry: no chip at all — no "0 viewed", no
    // rounded stand-in, and no second chip anywhere in the grid.
    expect(screen.getAllByText('3 saved this week')).toHaveLength(1)
    expect(screen.queryByText(/viewed/)).toBeNull()
    expect(screen.queryByText(/0 saved|0 viewed/)).toBeNull()
  })

  it('renders no chip at all when the store has no real counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) =>
        String(input).startsWith('/api/engagement-chips')
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                data: {
                  products: {},
                  window: { today: null, week_from: null, week_to: null },
                },
              }),
            }
          : { ok: true, status: 200, json: async () => ({ data: {} }) },
      ),
    )

    render(
      <CollectionView
        collection={COLLECTION}
        slug="festive-edit"
        store="meera-sarees"
        productsApiPath="/api/meera-sarees/festive-edit/products"
      />,
    )

    // The grid itself is up...
    expect(await screen.findByText('Festive Design 1')).toBeInTheDocument()
    // ...and no chip was invented for any of it.
    expect(screen.queryByText(/viewed|saved this week|saved recently/)).toBeNull()
  })
})
