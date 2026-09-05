import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VerifyOtpResult } from '../../src/lib/api'
import { router } from 'expo-router'
import { completeLogin } from '../../app/auth/otp'
import { setAuthChangeListener } from '../../src/lib/auth-events'

// ── Module mocks ──────────────────────────────────────────────────
// The real otp.tsx dep tree is heavy (fetch client, MSG91 SDK, gradient
// component, SecureStore). Mock everything except the behavior under test:
// storage stays real (against a fake expo-secure-store) and auth-events stays
// real (completeLogin must emit through it — the Stack.Protected guards flip
// from that emission, not from any navigation call).

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/api', () => ({
  authApi: {},
  setToken: vi.fn(async () => {}),
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

/** Every auth change completeLogin emitted, in order. */
const emitted: { authed: boolean; navigateTo?: string }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  emitted.length = 0
  setAuthChangeListener((change) => emitted.push({ ...change }))
})

const completedRetailer = {
  access_token: 'token-abc',
  is_staff: false,
  is_new: false,
  retailer: {
    id: 'ret_1',
    shop_name: 'Radha Clothing Store',
    onboarding_completed: true,
  },
} as VerifyOtpResult

const newRetailer = {
  access_token: 'token-new',
  is_staff: false,
  is_new: true,
  retailer: {
    id: 'ret_2',
    shop_name: '',
    onboarding_completed: false,
  },
} as VerifyOtpResult

describe('completeLogin — emits an auth change so Stack.Protected guards flip', () => {
  it('completed retailer: authed=true with no navigateTo, and NO manual navigation', async () => {
    await completeLogin(completedRetailer)

    expect(emitted).toEqual([{ authed: true, navigateTo: undefined }])
    // The guards auto-focus (tabs) after the flip — no replace/reset needed.
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('new retailer: authed=true with a pending navigateTo to onboarding', async () => {
    await completeLogin(newRetailer)

    expect(emitted).toEqual([{ authed: true, navigateTo: '/onboarding' }])
    // The provider performs that navigation only AFTER the guards flip.
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('shop staff and team members: authed=true with no navigateTo (staff auto-focuses)', async () => {
    const staff = {
      access_token: 'token-staff',
      is_staff: true,
      staff: {
        id: 's1',
        name: 'Anjali',
        role: 'MANAGER',
        retailer_id: 'ret_1',
        retailer_shop_name: 'Radha Clothing Store',
        retailer_city: 'Jaipur',
      },
    } as VerifyOtpResult
    await completeLogin(staff)
    expect(emitted).toEqual([{ authed: true, navigateTo: undefined }])

    emitted.length = 0
    const teamMember = {
      access_token: 'token-team',
      is_staff: true,
      team_member: { id: 't1', name: 'Support', email: 's@k.app', role: 'SUPPORT' },
    } as VerifyOtpResult
    await completeLogin(teamMember)
    expect(emitted).toEqual([{ authed: true, navigateTo: undefined }])
  })

  it('demo bypass (no profile yet): authed=true with a pending navigateTo to onboarding', async () => {
    await completeLogin({ access_token: 'token-demo', is_staff: false } as VerifyOtpResult)

    expect(emitted).toEqual([{ authed: true, navigateTo: '/onboarding' }])
  })

  it('never navigates to auth screens itself (regression: fresh-login back → Login)', async () => {
    // The bug this guards against: completeLogin used to router.replace('/…')
    // which left auth/phone at the bottom of the root stack, so Android
    // hardware-back popped to Login before the dashboard's double-tap-to-exit
    // handler ran. Now completeLogin only emits auth state; the Protected
    // guards remove auth/phone + auth/otp from the navigation state entirely.
    await completeLogin(completedRetailer)
    await completeLogin(newRetailer)

    expect(router.replace).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    for (const change of emitted) {
      expect(change.authed).toBe(true)
      if (change.navigateTo !== undefined) {
        expect(change.navigateTo).not.toMatch(/auth\//)
      }
    }
  })
})