import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import type { VerifyOtpResult } from '../../src/lib/api'
import { router } from 'expo-router'
import { completeLogin } from '../../app/auth/otp'
import { AuthProvider, useAuth, type AuthContextValue } from '../../src/lib/auth-context'

// ── Module mocks ──────────────────────────────────────────────────
// End-to-end CLIENT chain for FR-2.2: real `completeLogin` → real storage →
// real `AuthProvider`. The only things swapped are the native/external seams:
//   - expo-secure-store → in-memory Map (real storage.ts module on top)
//   - the API client module → setToken/getToken wired to that same Map
//     (completeLogin and AuthProvider share the module, so both resolve to
//     the same mock and the token survives the round trip)
//   - MSG91 widget + GradientButton (otp.tsx dep-tree weight, same convention
//     as login-routing.test.ts)
// Everything that decides the landing stays REAL: completeLogin's storage
// writes + staff_kind marker, auth-events emissions, AuthProvider's
// readStaffContext derivation, and the guard predicates below (copied from
// app/_layout.tsx).

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

vi.mock('expo-router', () => ({
  router: { navigate: vi.fn(), replace: vi.fn(), back: vi.fn() },
}))

vi.mock('../../src/lib/api', () => ({
  authApi: {},
  // setToken must actually persist — AuthProvider hydrates from this token.
  setToken: vi.fn(async (token: string) => {
    store.set('auth_token', token)
  }),
  getToken: vi.fn(async () => store.get('auth_token') ?? null),
  clearRequestCache: vi.fn(async () => {}),
  ApiError: class extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('../../src/lib/msg91-otp', () => ({
  isMsg91OtpConfigured: () => false,
  extractMsg91AccessToken: vi.fn(),
  extractMsg91ReqId: vi.fn(),
  retryMsg91Otp: vi.fn(),
  sendMsg91Otp: vi.fn(),
  verifyMsg91Otp: vi.fn(),
}))

vi.mock('../../src/components/GradientButton', () => ({
  GradientButton: () => null,
}))

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

/** Mount the real AuthProvider around a probe that captures the context. */
async function mountProvider() {
  let captured: AuthContextValue | null = null
  function Probe() {
    captured = useAuth()
    return React.createElement(Text, null, captured.status)
  }
  await act(async () => {
    renderer.create(
      React.createElement(AuthProvider, null, React.createElement(Probe)),
    )
  })
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return { get: () => captured, flush }
}

/** The exact staff payload shape the API returns for a shop-staff login. */
const shopStaffPayload = {
  access_token: 'token-shop-staff',
  is_staff: true,
  staff: {
    id: 's_1',
    name: 'Anjali',
    role: 'MANAGER',
    retailer_id: 'ret_1',
    retailer_shop_name: 'Radha Clothing Store',
    retailer_city: 'Jaipur',
  },
} as VerifyOtpResult

describe('FR-2.2 end-to-end client chain — shop-staff login lands on retailer tabs', () => {
  it('completeLogin → storage → AuthProvider resolves isShopStaff, and the _layout.tsx guard predicates focus (tabs), never /staff or onboarding', async () => {
    // Boot the app logged out (real provider hydrates unauthenticated).
    const { get, flush } = await mountProvider()
    await flush()
    expect(get()!.status).toBe('unauthenticated')

    // The shop employee logs in — real completeLogin with the real payload.
    await act(async () => {
      await completeLogin(shopStaffPayload)
    })
    await flush()

    // Storage was written by the REAL completeLogin (staff_kind marker FR-2.2).
    expect(store.get('auth_token')).toBe('token-shop-staff')
    expect(store.get('staff_kind')).toBe('shop')
    expect(store.get('staff_role')).toBe('MANAGER')
    expect(store.get('staff_retailer_id')).toBe('ret_1')
    expect(store.get('retailer_id')).toBe('ret_1')

    // The REAL AuthProvider re-read that storage and derived the split.
    const c = get()!
    expect(c.status).toBe('authenticated')
    expect(c.isAuthenticated).toBe(true)
    expect(c.isShopStaff).toBe(true)
    expect(c.isTeamMember).toBe(false)
    expect(c.staffRole).toBe('MANAGER')

    // ── The guard predicates from app/_layout.tsx ──
    const isAuthed = c.isAuthenticated
    const isTeamMember = c.isTeamMember

    // (tabs) Protected block: guard={isAuthed && !isTeamMember} — TRUE,
    // so the retailer dashboard is in routeNames and auto-focused.
    expect(isAuthed && !isTeamMember).toBe(true)

    // /staff Protected block: guard={isTeamMember} — FALSE, so the internal
    // agent surface is excluded for shop staff.
    expect(isTeamMember).toBe(false)

    // Onboarding: completeLogin emitted {authed:true} with NO navigateTo, so
    // pendingNav stays null and the provider never navigates anywhere.
    expect(vi.mocked(router.navigate)).not.toHaveBeenCalled()
    expect(vi.mocked(router.replace)).not.toHaveBeenCalled()
    expect(vi.mocked(router.navigate)).not.toHaveBeenCalledWith('/onboarding')
  })

  it('team-member login still resolves isTeamMember (keeps /staff)', async () => {
    const { get, flush } = await mountProvider()
    await flush()

    await act(async () => {
      await completeLogin({
        access_token: 'token-team',
        is_staff: true,
        team_member: { id: 't_1', name: 'Support', email: 's@k.app', role: 'SUPPORT' },
      } as VerifyOtpResult)
    })
    await flush()

    const c = get()!
    expect(c.isAuthenticated).toBe(true)
    expect(c.isTeamMember).toBe(true)
    expect(c.isShopStaff).toBe(false)
    // /staff block guard true → the internal surface stays reachable.
    expect(c.isTeamMember).toBe(true)
    // (tabs) block guard false → retailer dashboard excluded for agents.
    expect(c.isAuthenticated && !c.isTeamMember).toBe(false)
    expect(vi.mocked(router.navigate)).not.toHaveBeenCalled()
  })
})