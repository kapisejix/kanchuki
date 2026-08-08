import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedFetch, clearRequestCache } from './request-cache'

/**
 * Deterministic tests for the cache TTL jitter (0–50% of the base TTL, applied
 * per entry at write time). Fake timers control Date.now(), a Math.random spy
 * pins the jitter to a known value, and global fetch is stubbed so no network
 * is involved. cachedFetch is pure fetch logic — no RN imports, so none of
 * setup.ts's component mocks are needed.
 */

let fetchCalls: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchCalls = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchCalls)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearRequestCache()
})

describe('cachedFetch GET caching', () => {
  it('serves a cached GET without a second network call', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // jitter 0 → expires at exactly the base TTL
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })
    expect(fetchCalls).toHaveBeenCalledTimes(1)

    // t=999ms — inside the 1000ms window
    await vi.advanceTimersByTimeAsync(999)
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })
    expect(fetchCalls).toHaveBeenCalledTimes(1)
  })

  it('refetches once the jittered expiry passes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // jitter 0 → expiry at exactly 1000ms
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })

    await vi.advanceTimersByTimeAsync(1001)
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })
    expect(fetchCalls).toHaveBeenCalledTimes(2)
  })

  it('jitter spreads expiries — entry survives past the base TTL when jitter > 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999) // jitter ≈ 50% of TTL → expiry ≈ 1500ms
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })

    // Base TTL passed but the jittered expiry hasn't — still served from cache.
    await vi.advanceTimersByTimeAsync(1001)
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 1000 })
    expect(fetchCalls).toHaveBeenCalledTimes(1)
  })

  it('getCacheTtlMs: 0 still disables caching (jitter never applies)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 0 })
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 0 })
    expect(fetchCalls).toHaveBeenCalledTimes(2)
  })

  it('clearRequestCache drops entries so the next call refetches', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 60_000 })

    clearRequestCache()
    await cachedFetch('https://api.test/data', { getCacheTtlMs: 60_000 })
    expect(fetchCalls).toHaveBeenCalledTimes(2)
  })
})
