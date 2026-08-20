import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    shop_name: 'Meera Sarees',
    city: 'Jaipur',
    phone: '919999999999',
    logo_url: null,
    banner_url: null,
    public_slug: 'meera-sarees',
  },
  title: 'Festive Edit',
  description: 'A handpicked edit from the store.',
  expires_at: null,
  products: [makeProduct(1), makeProduct(2), makeProduct(3)],
  total: 3,
  page: 1,
  page_size: 12,
  filters: {
    categories: [{ value: 'Anarkali Suit', count: 3 }],
    colors: [{ value: 'Maroon', count: 3 }],
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
    // CollectionView pings the checkout status + fire-and-forgets the favorite
    // POST — both must resolve for the assertions to be deterministic.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { checkout_enabled: false } }),
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
    expect(screen.getByRole('heading', { name: 'Festive Edit' })).toBeInTheDocument()

    // Favorite product 1. The card photo div also has role="button" with the
    // accessible name "Festive Design 1 Add to favorites" (img alt + nested
    // heart label), so the name must be anchored exactly with a regex — plain
    // string matching would hit the photo div first.
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Add to favorites$/ })[0],
    )
    expect(screen.getByText('Selected (1)')).toBeInTheDocument()
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
    expect(screen.getByText('Selected (1)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Remove from favorites$/ }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('kanchuki_wishlist_festive-edit')).toContain('prod-1')
  })
})
