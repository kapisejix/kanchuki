// The (shopper) guard is what makes `return_to` exist, so this pins both ends
// of the contract:
//   - an unauthenticated visitor is sent to /login carrying the page they
//     wanted, and
//   - the value written is the *validated* one, so a post-login navigation can
//     never leave the origin (see lib/return-to.ts).
//
// Before this, the guard pointed at `/` — the retailer marketing page, with no
// customer login surface — so the parameter it wrote could not be consumed.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { clearPassportCache } from '@/lib/passport-client'
import { DEFAULT_RETURN_TO } from '@/lib/return-to'
import ShopperLayout from '../layout'

const nav = createControllablePathname('/my-stores')

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The account payload /api/passport/me returns for a signed-in shopper. */
const ACCOUNT = {
  account: {
    id: 'customer-1',
    name: 'Ananya',
    phone_masked: '••••••9999',
    usual_size: 'M',
    city: 'Jaipur',
  },
}

/** The URL the guard navigated to, parsed. */
function redirectTarget(): URL {
  const call = nav.router.replace.mock.calls.at(-1)
  expect(call, 'guard never redirected').toBeDefined()
  return new URL(call?.[0] as string, 'https://kanchuki.app')
}

beforeEach(() => {
  nav.reset()
  // passport-client memoises its last result (including a negative one) for
  // 30s at module scope — reset it or tests leak state into each other.
  clearPassportCache()
  fetchMock = vi.fn(async () => jsonResponse(401, { error: { message: 'No session' } }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // The guard reads the query string off window.location, so reset it or one
  // test's URL leaks into the next.
  window.history.replaceState({}, '', '/')
})

describe('(shopper) guard', () => {
  it('sends an unauthenticated visitor to /login with the page they wanted', async () => {
    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())

    const target = redirectTarget()
    expect(target.pathname).toBe('/login')
    // Decoded back to the guard's own path: the value survives the round trip.
    expect(target.searchParams.get('return_to')).toBe('/my-stores')
    // Never to the marketing page with an unconsumable parameter.
    expect(target.pathname).not.toBe('/')
  })

  it('carries the query string, so the shopper returns to the exact URL they were intercepted on', async () => {
    window.history.replaceState({}, '', '/my-stores?tab=orders&page=2')

    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())

    // Path AND query, decoded straight back to what the browser had.
    expect(redirectTarget().searchParams.get('return_to')).toBe('/my-stores?tab=orders&page=2')
  })

  it('sends the bare path when there is no query string', async () => {
    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())
    expect(redirectTarget().searchParams.get('return_to')).toBe('/my-stores')
  })

  it('sends a visitor to /login when the session check throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())
    expect(redirectTarget().pathname).toBe('/login')
  })

  it('renders the page and redirects nowhere for a signed-in shopper', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, ACCOUNT))

    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    expect(await screen.findByText('shopper content')).toBeInTheDocument()
    expect(nav.router.replace).not.toHaveBeenCalled()
  })

  it('writes a same-origin target even if the pathname were hostile', async () => {
    // usePathname() is internal and same-origin by construction, so this cannot
    // happen today — the test exists so that if it ever could, the value that
    // reaches the URL is still the safe fallback rather than `//evil.example`.
    nav.setPathname('//evil.example')

    render(
      <ShopperLayout>
        <p>shopper content</p>
      </ShopperLayout>,
    )

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())

    const target = redirectTarget()
    expect(target.pathname).toBe('/login')
    expect(target.host).toBe('kanchuki.app')
    expect(target.searchParams.get('return_to')).toBe(DEFAULT_RETURN_TO)
  })
})
