import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { router } from 'expo-router'
import {
  AuthProvider,
  useAuth,
  type AuthContextValue,
} from './auth-context'
import { emitAuthChange } from './auth-events'

// ── Module mocks ──────────────────────────────────────────────────
// The provider's dep tree pulls in the full API client (expo-file-system +
// request-cache + compress-image — esbuild OOM risk, same convention as the
// catalog/settings tests). Mock './api' and './storage' against one in-memory
// map so hydration, signOut and the 401-flip event are all fully controlled.
// './auth-events' stays REAL — the provider must react to its emissions.

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('expo-router', () => ({
  router: { navigate: vi.fn(), replace: vi.fn(), back: vi.fn() },
}))

vi.mock('./api', () => ({
  getToken: vi.fn(async () => store.get('auth_token') ?? null),
  clearRequestCache: vi.fn(async () => {}),
}))

vi.mock('./storage', () => ({
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deleteItem: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

/** Mount AuthProvider around a probe that captures the context value. */
async function mount() {
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

describe('AuthProvider', () => {
  it('hydrates to unauthenticated when no token is stored', async () => {
    const { get, flush } = await mount()
    await flush()

    expect(get()!.status).toBe('unauthenticated')
    expect(get()!.isAuthenticated).toBe(false)
    expect(get()!.isStaff).toBe(false)
  })

  it('hydrates to authenticated (retailer) when only a token is stored', async () => {
    store.set('auth_token', 'tok-1')
    const { get, flush } = await mount()
    await flush()

    expect(get()!.status).toBe('authenticated')
    expect(get()!.isAuthenticated).toBe(true)
    expect(get()!.isStaff).toBe(false)
  })

  it('hydrates to authenticated staff when staff_role is stored', async () => {
    store.set('auth_token', 'tok-1')
    store.set('staff_role', 'MANAGER')
    const { get, flush } = await mount()
    await flush()

    expect(get()!.status).toBe('authenticated')
    expect(get()!.isStaff).toBe(true)
  })

  it('signOut clears every auth key and flips back to unauthenticated', async () => {
    store.set('auth_token', 'tok-1')
    store.set('staff_role', 'MANAGER')
    store.set('refresh_token', 'rt-1')
    const { get, flush } = await mount()
    await flush()
    expect(get()!.status).toBe('authenticated')

    await act(async () => {
      await get()!.signOut()
    })

    expect(get()!.status).toBe('unauthenticated')
    expect(get()!.isAuthenticated).toBe(false)
    for (const key of [
      'auth_token',
      'refresh_token',
      'retailer_id',
      'staff_role',
      'staff_name',
      'staff_retailer_id',
      'admin_key',
    ]) {
      expect(store.has(key)).toBe(false)
    }
  })

  it('flips to unauthenticated on an external authed:false event (401 path)', async () => {
    store.set('auth_token', 'tok-1')
    const { get, flush } = await mount()
    await flush()
    expect(get()!.status).toBe('authenticated')

    act(() => {
      emitAuthChange({ authed: false })
    })
    await flush()

    expect(get()!.status).toBe('unauthenticated')
    expect(get()!.isAuthenticated).toBe(false)
  })

  it('navigates to the pending destination only after an authed:true flip', async () => {
    store.set('auth_token', 'tok-1')
    const { get, flush } = await mount()
    await flush()

    act(() => {
      emitAuthChange({ authed: true, navigateTo: '/onboarding' })
    })
    await flush()

    expect(get()!.status).toBe('authenticated')
    expect(vi.mocked(router.navigate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(router.navigate)).toHaveBeenCalledWith('/onboarding')
  })

  it('does not navigate for an authed:true flip without a pending destination', async () => {
    store.set('auth_token', 'tok-1')
    const { flush } = await mount()
    await flush()

    act(() => {
      emitAuthChange({ authed: true })
    })
    await flush()

    expect(vi.mocked(router.navigate)).not.toHaveBeenCalled()
  })
})