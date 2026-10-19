import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PublicCollection } from '@kanchuki/shared'
import { WishlistView } from '../WishlistView'
import { wishlistKey } from '../../lib/wishlist'

// F-044 E2 — "Send my picks to the store": one POST with localStorage ids ∪ this
// store's passport wishlist rows, wa.me fallback on any non-200, sync guard.

vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
  default: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt ?? ''} />,
}))

const COLLECTION = {
  retailer: {
    id: 'r-meera',
    shop_name: 'Meera Sarees',
    city: 'Jaipur',
    phone: '919999999999',
    logo_url: null,
    banner_url: null,
    public_slug: 'meera',
    latitude: null,
    longitude: null,
  },
  title: 'Festive Edit',
  description: null,
  expires_at: null,
  products: [],
  total: 0,
  page: 1,
  page_size: 12,
  filters: { categories: [], colors: [], sizes: [] },
} as unknown as PublicCollection

const passportRow = (id: string, retailerId: string) => ({
  id: `w-${id}`,
  product_id: id,
  created_at: '2026-10-17T00:00:00Z',
  product: {
    id,
    name: `P ${id}`,
    category: null,
    primary_color: null,
    price_min: 100000,
    price_max: null,
    photo_url: null,
    retailer: { id: retailerId, shop_name: 'x', public_slug: null },
  },
})

let enquire: () => Promise<Response>
const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
  url === '/api/passport/wishlist'
    ? Promise.resolve(
        Response.json({
          items: [passportRow('pp-mine', 'r-meera'), passportRow('pp-other', 'r-other')],
        }),
      )
    : enquire(),
)
const openSpy = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'open').mockImplementation(openSpy)
  enquire = () => Promise.resolve(Response.json({ data: { whatsapp_url: 'https://wa.me/from-api' } }))
})
afterEach(() => {
  fetchMock.mockClear()
  openSpy.mockReset()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const seedLocal = (...ids: string[]) =>
  localStorage.setItem(
    wishlistKey('festive-edit'),
    JSON.stringify(
      ids.map((id) => ({ id, name: `L ${id}`, price_min: 50000, price_max: null, category: null })),
    ),
  )
const enquireCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/enquire'))
const sendBtn = () => screen.getByRole('button', { name: /send my picks to the store/i })

describe('WishlistView — Send my picks (F-044 E2)', () => {
  it('is disabled with zero picks', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(Response.json({ items: [] })))
    render(<WishlistView collection={COLLECTION} slug="festive-edit" store="meera" />)
    await waitFor(() => expect(sendBtn()).toBeDisabled())
    fireEvent.click(sendBtn())
    expect(enquireCalls()).toHaveLength(0)
  })

  it('POSTs local ∪ this-store passport ids once, then opens the API whatsapp_url', async () => {
    seedLocal('loc-1')
    render(<WishlistView collection={COLLECTION} slug="festive-edit" store="meera" />)
    await waitFor(() => expect(sendBtn()).toHaveTextContent('(2)'))
    fireEvent.click(sendBtn())
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://wa.me/from-api', '_self'))
    const [url, init] = enquireCalls()[0]!
    expect(url).toBe('/api/meera/festive-edit/enquire')
    expect(JSON.parse(init!.body as string)).toEqual({
      product_ids: ['loc-1', 'pp-mine'],
    })
  })

  it('double click sends ONE request (RC-015 sync guard)', async () => {
    seedLocal('loc-1')
    let release!: () => void
    enquire = () =>
      new Promise((r) => {
        release = () => r(Response.json({ data: { whatsapp_url: 'u' } }))
      })
    render(<WishlistView collection={COLLECTION} slug="festive-edit" store={null} />)
    await waitFor(() => expect(sendBtn()).toBeEnabled())
    fireEvent.click(sendBtn())
    fireEvent.click(sendBtn())
    await waitFor(() => expect(enquireCalls()).toHaveLength(1))
    release()
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    expect(enquireCalls()).toHaveLength(1)
    expect(enquireCalls()[0]![0]).toBe('/api/c/festive-edit/enquire')
  })

  it('non-200 (pseudo-slug 404) falls back to the client wa.me link', async () => {
    seedLocal('loc-1')
    enquire = () => Promise.resolve(Response.json({ error: {} }, { status: 404 }))
    render(<WishlistView collection={COLLECTION} slug="festive-edit" store="meera" />)
    await waitFor(() => expect(sendBtn()).toBeEnabled())
    fireEvent.click(sendBtn())
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    const [url, target] = openSpy.mock.calls[0]!
    expect(url).toContain('wa.me/919999999999')
    expect(decodeURIComponent(url)).toContain('L loc-1')
    expect(target).toBe('_self')
  })
})
