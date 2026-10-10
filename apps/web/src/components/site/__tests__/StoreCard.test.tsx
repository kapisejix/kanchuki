// Shared store card (/stores + homepage teaser). What matters:
//   - segments render as Ladies / Gents / Kids (MEN is shown as "Gents")
//   - distance only appears when the list was fetched with coordinates
//   - Share never throws when the share sheet is dismissed (RC-014), and falls
//     back to a WhatsApp link when the browser has no Web Share API
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoreCardData } from '@/lib/nearby-stores'
import StoreCard from '../StoreCard'

const store: StoreCardData = {
  public_slug: 'meera-sarees',
  shop_name: 'Meera Sarees',
  city: 'Jaipur',
  address: '12 MI Road',
  logo_url: null,
  product_count: 12,
  is_featured: false,
  store_types: ['LADIES', 'MEN', 'KIDS'],
  distance_km: 1.2,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StoreCard', () => {
  it('shows name, address, distance, segment chips and a catalog link', () => {
    render(<StoreCard store={store} />)

    expect(screen.getByRole('link', { name: 'Meera Sarees' })).toHaveAttribute('href', '/meera-sarees')
    expect(screen.getByText(/12 MI Road, Jaipur/)).toBeInTheDocument()
    expect(screen.getByText(/1\.2 km/)).toBeInTheDocument()
    for (const label of ['Ladies', 'Gents', 'Kids']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Catalog' })).toHaveAttribute('href', '/meera-sarees')
  })

  it('hides the distance when the list was not location-based', () => {
    render(<StoreCard store={{ ...store, distance_km: null }} />)
    expect(screen.queryByText(/ km/)).not.toBeInTheDocument()
  })

  it('swallows a dismissed share sheet instead of throwing', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, share })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(<StoreCard store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share Meera Sarees' }))

    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to a WhatsApp link when Web Share is unavailable', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(<StoreCard store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share Meera Sarees' }))

    expect(open).toHaveBeenCalledOnce()
    expect(String(open.mock.calls[0]?.[0])).toContain('https://wa.me/?text=')
    expect(String(open.mock.calls[0]?.[0])).toContain(encodeURIComponent('/meera-sarees'))
  })
})
