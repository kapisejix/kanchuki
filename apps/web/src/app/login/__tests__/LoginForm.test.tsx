// LoginForm — the surface that finally consumes `return_to`.
//
// What matters here:
//   1. it drives the existing passport OTP endpoints (no new auth path),
//   2. on success it navigates to the validated `return_to`,
//   3. a hostile target cannot become a navigation (the open-redirect guard is
//      applied at the boundary that performs the redirect, not only where the
//      value is read),
//   4. a visitor who is already signed in is sent on rather than shown a form,
//   5. the memoised session is invalidated before navigating, so the (shopper)
//      guard cannot read a stale identity during the hand-off.
//
// Note on (5): getPassport only ever serves a POSITIVE result from its cache —
// a stored null is falsy, so it falls through to the network. A "negative cache
// bounces the shopper back to /login" story is therefore not a real failure
// mode today (verified: the live /my-stores round trip passes with the clear
// removed). The call is kept as defence for the stale-identity and
// future-caching cases, and this test pins that it stays.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { clearPassportCache } from '@/lib/passport-client'
import { LoginForm } from '../LoginForm'

// Spy through to the real implementation: the cache itself must still work, we
// only want to observe that the form invalidates it.
const { clearPassportCacheSpy } = vi.hoisted(() => ({ clearPassportCacheSpy: vi.fn() }))

vi.mock('@/lib/passport-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/passport-client')>()
  return {
    ...actual,
    clearPassportCache: () => {
      clearPassportCacheSpy()
      actual.clearPassportCache()
    },
  }
})

// Force the API OTP path. The widget path is exercised on real devices (and by
// the store ContactGate suite); pinning it off keeps this test hermetic — it
// never reaches for an external script.
vi.mock('@/lib/msg91-widget', () => ({
  isMsg91WidgetConfigured: () => false,
  loadMsg91Widget: async () => false,
  sendOtpViaWidget: async () => ({ ok: false }),
  verifyOtpViaWidget: async () => ({ ok: false }),
  retryOtpViaWidget: async () => ({ ok: false }),
  widgetErrorMessage: (_err: unknown, fallback: string) => fallback,
}))

const nav = createControllablePathname('/login')

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Paths the component asked for, in order. */
function requestedPaths(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]))
}

function bodyOf(path: string): unknown {
  const call = fetchMock.mock.calls.find((c) => String(c[0]) === path)
  const init = call?.[1] as RequestInit | undefined
  return init?.body ? JSON.parse(String(init.body)) : undefined
}

/** The URL the form navigated to, parsed against a fixed origin. */
function navigationTarget(): URL {
  const call = nav.router.replace.mock.calls.at(-1)
  expect(call, 'form never navigated').toBeDefined()
  return new URL(call?.[0] as string, 'https://kanchuki.app')
}

beforeEach(() => {
  nav.reset()
  clearPassportCache()
  // After the isolation reset above, which itself routes through the spy.
  clearPassportCacheSpy.mockClear()
  // Default: no passport session, so the form is the thing under test.
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/passport/me')) {
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
    }
    if (url.includes('/api/passport/otp/send')) {
      return jsonResponse(200, { ok: true, masked_phone: '••••••9999' })
    }
    if (url.includes('/api/passport/otp/verify')) {
      return jsonResponse(200, { ok: true, account_id: 'customer-1', is_new: false })
    }
    throw new Error(`unstubbed fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Renders the form and waits past the "already signed in?" check. */
async function renderForm(returnTo: string) {
  render(<LoginForm returnTo={returnTo} />)
  return screen.findByLabelText(/whatsapp number/i)
}

/** Fills the phone step and submits it, landing on the OTP step. */
async function reachOtpStep(returnTo: string, phone = '9876543210') {
  const phoneInput = await renderForm(returnTo)
  fireEvent.change(phoneInput, { target: { value: phone } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /send otp/i }))
  return screen.findByLabelText(/6-digit code/i)
}

/** The whole happy path: phone → code → navigation. */
async function completeLogin(returnTo: string, code = '123456') {
  const codeInput = await reachOtpStep(returnTo)
  fireEvent.change(codeInput, { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))
  await waitFor(() => expect(nav.router.replace).toHaveBeenCalled())
}

describe('LoginForm', () => {
  it('shows the phone step with OTP disabled until a number and consent are given', async () => {
    const phoneInput = await renderForm('/my-stores')

    const send = screen.getByRole('button', { name: /send otp/i })
    expect(send).toBeDisabled()

    fireEvent.change(phoneInput, { target: { value: '9876543210' } })
    expect(send).toBeDisabled() // consent still missing

    fireEvent.click(screen.getByRole('checkbox'))
    expect(send).toBeEnabled()
  })

  it('sends the OTP through the existing passport endpoint and moves to the code step', async () => {
    await reachOtpStep('/my-stores')

    expect(requestedPaths()).toContain('/api/passport/otp/send')
    expect(bodyOf('/api/passport/otp/send')).toEqual({ phone: '9876543210' })
    expect(screen.queryByLabelText(/whatsapp number/i)).not.toBeInTheDocument()
  })

  it('verifies the code and continues to the requested page', async () => {
    await completeLogin('/my-stores')

    expect(requestedPaths()).toContain('/api/passport/otp/verify')
    expect(bodyOf('/api/passport/otp/verify')).toEqual({ phone: '9876543210', otp: '123456' })
    expect(nav.router.replace).toHaveBeenCalledWith('/my-stores')
  })

  it('preserves a query string on the requested page', async () => {
    await completeLogin('/my-profile?tab=orders')
    expect(nav.router.replace).toHaveBeenCalledWith('/my-profile?tab=orders')
  })

  it.each([
    ['//evil.example'],
    ['https://evil.example/phish'],
    ['/%5Cevil.example'],
    ['javascript:alert(1)'],
  ])('refuses to navigate off-origin for target %s', async (hostile) => {
    // The prop is exercised directly — this is the boundary that would leak if
    // validation lived only in page.tsx.
    await completeLogin(hostile)

    expect(nav.router.replace).toHaveBeenCalledWith('/my-stores')

    const target = navigationTarget()
    expect(target.host).toBe('kanchuki.app')
    expect(target.pathname).toBe('/my-stores')
  })

  it('sends a visitor with an existing session on instead of showing a login form', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/passport/me')) {
        return jsonResponse(200, {
          account: {
            id: 'customer-1',
            name: 'Ananya',
            phone_masked: '••••••9999',
            usual_size: null,
            city: null,
          },
        })
      }
      throw new Error(`unstubbed fetch: ${url}`)
    })

    render(<LoginForm returnTo="/my-stores" />)

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/my-stores'))
    expect(screen.queryByLabelText(/whatsapp number/i)).not.toBeInTheDocument()
    // Never offered an OTP it does not need.
    expect(requestedPaths().some((p) => p.includes('/otp/send'))).toBe(false)
  })

  it('invalidates the memoised session before navigating', async () => {
    await completeLogin('/my-stores')

    // The guard mounts the instant this navigation lands and checks the
    // session itself — it must not be able to read one left over from before
    // the login.
    expect(clearPassportCacheSpy).toHaveBeenCalled()
  })

  it('surfaces the real API error and stays on the code step', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/passport/me')) {
        return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
      }
      if (url.includes('/api/passport/otp/send')) {
        return jsonResponse(200, { ok: true, masked_phone: '••••••9999' })
      }
      if (url.includes('/api/passport/otp/verify')) {
        return jsonResponse(401, {
          error: { code: 'INVALID_OTP', message: 'Incorrect OTP. Please try again.' },
        })
      }
      throw new Error(`unstubbed fetch: ${url}`)
    })

    const codeInput = await reachOtpStep('/my-stores')
    fireEvent.change(codeInput, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))

    expect(await screen.findByText('Incorrect OTP. Please try again.')).toBeInTheDocument()
    expect(nav.router.replace).not.toHaveBeenCalled()
    // Still on the code step so the shopper can retry.
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument()
  })

  it('falls back to the default destination when no target is supplied', async () => {
    await completeLogin('')
    expect(nav.router.replace).toHaveBeenCalledWith('/my-stores')
  })
})
