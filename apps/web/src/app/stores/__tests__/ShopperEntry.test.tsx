// The /stores customer entry point. It is the only place on the marketing site
// that asks who the visitor is, so what matters is that it shows the *right*
// state and that it never shows the wrong one even briefly:
//   - signed out            → "Log in" → /login
//   - signed in with a name → the shopper's name → /my-stores
//   - signed in, no name    → the "My Stores" fallback → /my-stores
//     (the passport OTP flow never captures a name, so null is the common case)
//   - while unknown         → nothing, not "Log in" (a signed-in shopper must
//     not be told to sign in while the check is in flight)
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPassportCache } from '@/lib/passport-client'
import ShopperEntry from '../ShopperEntry'

const ME_URL = '/api/passport/me'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function accountResponse(name: string | null): Response {
  return jsonResponse(200, {
    account: {
      id: 'customer-1',
      name,
      phone_masked: '••••••9999',
      usual_size: null,
      city: null,
    },
  })
}

beforeEach(() => {
  // passport-client memoises at module scope, so state leaks between tests.
  clearPassportCache()
  fetchMock = vi.fn(async () => jsonResponse(401, { error: { message: 'No session' } }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ShopperEntry', () => {
  it('offers Log in to a visitor with no passport session', async () => {
    render(<ShopperEntry />)

    const link = await screen.findByRole('link', { name: /log in/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it("shows the shopper's name and links to their stores when signed in", async () => {
    fetchMock.mockResolvedValue(accountResponse('Ananya Sharma'))
    render(<ShopperEntry />)

    const link = await screen.findByRole('link', { name: /ananya sharma/i })
    expect(link).toHaveAttribute('href', '/my-stores')
    // Not offering to log in someone who already is.
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument()
  })

  it('falls back to My Stores when the account has no name', async () => {
    fetchMock.mockResolvedValue(accountResponse(null))
    render(<ShopperEntry />)

    const link = await screen.findByRole('link', { name: /my stores/i })
    expect(link).toHaveAttribute('href', '/my-stores')
  })

  it('falls back to My Stores when the name is blank whitespace', async () => {
    fetchMock.mockResolvedValue(accountResponse('   '))
    render(<ShopperEntry />)

    const link = await screen.findByRole('link', { name: /my stores/i })
    expect(link).toHaveAttribute('href', '/my-stores')
  })

  it('renders nothing until the session is known, so it never flashes Log in', async () => {
    let release: (value: Response) => void = () => {}
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )

    render(<ShopperEntry />)

    // In flight: no link at all — neither "Log in" nor a name.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    release(accountResponse('Ananya'))
    expect(await screen.findByRole('link', { name: /ananya/i })).toBeInTheDocument()
  })

  it('treats a failing session check as signed out rather than erroring', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    render(<ShopperEntry />)

    const link = await screen.findByRole('link', { name: /log in/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('asks the API for the session with credentials and never sends an account id', async () => {
    render(<ShopperEntry />)
    await screen.findByRole('link', { name: /log in/i })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(ME_URL)
    expect(init.credentials).toBe('include')
    // The server decides who this is from the cookie; the client must not name a
    // customer, or one shopper could ask for another's identity.
    expect(String(init.body ?? '')).not.toContain('customer-1')
    expect(url).not.toContain('customer-1')
  })
})
