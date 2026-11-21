// RC-083: the profile toggles must reflect what the server stores.
//   - "Personalized recommendations" is loaded from GET /passport/preferences,
//     so a shopper who opted out does not see it ticked again on the next visit.
//   - The "WhatsApp messages from stores" box (never loaded, never saved) is gone.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getPassportSession } from '@/lib/passport-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyProfilePage from '../page'

vi.mock('@/lib/passport-client', () => ({
  getPassportSession: vi.fn(async () => ({ id: 'acc_1', name: 'Asha', phone_masked: '******3210', pref_styles: [] })),
}))

function mockFetch(profilingEnabled: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.startsWith('/api/passport/preferences')
        ? { profiling_enabled: profilingEnabled, nominee_name: null, nominee_phone: null }
        : url.startsWith('/api/passport/recently-viewed')
          ? { items: [] }
          : url.startsWith('/api/passport/wishlist')
            ? { items: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] }
            : { data: { names: ['Casual'] } }
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
}

describe('/my-profile toggles (RC-083)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('shows personalization off for a shopper who opted out', async () => {
    mockFetch(false)
    render(<MyProfilePage />)
    const box = await screen.findByRole('checkbox', { name: /personalized recommendations/i })
    await waitFor(() => expect(box).not.toBeChecked())
  })

  it('shows personalization on when the server says enabled', async () => {
    mockFetch(true)
    render(<MyProfilePage />)
    const box = await screen.findByRole('checkbox', { name: /personalized recommendations/i })
    expect(box).toBeChecked()
  })

  it('has no WhatsApp messages toggle', async () => {
    mockFetch(true)
    render(<MyProfilePage />)
    await screen.findByRole('checkbox', { name: /personalized recommendations/i })
    expect(screen.queryByText(/whatsapp messages from stores/i)).toBeNull()
  })
})

// RC-180: the Saved tile was a hard-coded 0, an Enquiries tile showed a number that
// was never read, and "Save Preferences" waited 500 ms and saved nothing.
describe('/my-profile stats and style save (RC-180)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('Saved shows the real wishlist count; there is no Enquiries tile', async () => {
    mockFetch(true)
    render(<MyProfilePage />)
    const saved = await screen.findByText('Saved')
    await waitFor(() => expect(saved.parentElement?.textContent).toContain('3'))
    expect(screen.queryByText('Enquiries')).toBeNull()
  })

  it('Save Preferences PUTs the chosen styles', async () => {
    vi.mocked(getPassportSession).mockResolvedValueOnce({
      id: 'acc_1', name: 'Asha', phone_masked: '******3210', pref_styles: ['Casual'],
    } as never)
    mockFetch(true)
    render(<MyProfilePage />)
    fireEvent.click(await screen.findByRole('button', { name: /save preferences/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/passport/preferences',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ pref_styles: ['Casual'] }) }),
      ),
    )
  })
})
