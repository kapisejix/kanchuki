import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  startTryOn: vi.fn(),
  getTryOnStatus: vi.fn(),
  discardTryOnJobs: vi.fn(),
  tryOnPacks: vi.fn(),
  compress: vi.fn(),
  deleteAsync: vi.fn(),
}))

vi.mock('./api/products', () => ({
  productApi: {
    startTryOn: m.startTryOn,
    getTryOnStatus: m.getTryOnStatus,
    discardTryOnJobs: m.discardTryOnJobs,
  },
}))
vi.mock('./api/billing', () => ({ billingApi: { tryOnPacks: m.tryOnPacks } }))
vi.mock('./compress-image', () => ({ compressImageForUpload: m.compress }))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: m.deleteAsync,
}))
// Poll immediately, no real timers: loop onPoll until it returns true.
vi.mock('./polling', () => ({
  pollWithBackoff: ({
    onPoll,
    maxAttempts = 60,
  }: {
    onPoll: () => Promise<boolean>
    maxAttempts?: number
  }) => {
    let stopped = false
    void (async () => {
      for (let i = 0; i < maxAttempts && !stopped; i++) {
        try {
          if (await onPoll()) return
        } catch {
          /* transient */
        }
        await Promise.resolve()
      }
    })()
    return () => {
      stopped = true
    }
  },
}))

import {
  runTryOnSession,
  cleanupSession,
  planSession,
  loadBuyablePacks,
  isAppCacheUri,
  type SessionItem,
} from './try-on-session'

class FakeApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Product ${i + 1}` }))

const run = (
  n: number,
  signal: AbortSignal = new AbortController().signal,
  onCompressed?: (u: string) => void,
) => {
  const seen: SessionItem[] = []
  const p = runTryOnSession({
    products: products(n),
    photoUri: 'file:///cache/cam.jpg',
    consentVersion: 'v1',
    onItem: (i) => seen.push(i),
    signal,
    onCompressed,
  })
  return { p, seen }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.compress.mockResolvedValue('file:///cache/small.jpg')
  m.deleteAsync.mockResolvedValue(undefined)
  m.discardTryOnJobs.mockResolvedValue({ data: { discarded: 1, failed: 0, skipped: 0 } })
  m.startTryOn.mockImplementation(async (pid: string) => ({
    data: { job_id: `j-${pid}`, status: 'pending' },
  }))
  m.getTryOnStatus.mockImplementation(async (_p: string, jobId: string) => ({
    data: { status: 'ready', url: `https://r2/${jobId}.jpg` },
  }))
})

describe('runTryOnSession', () => {
  it('never runs more than 2 jobs at once and finishes all 4', async () => {
    let active = 0
    let peak = 0
    m.startTryOn.mockImplementation(async (pid: string) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      return { data: { job_id: `j-${pid}`, status: 'pending' } }
    })
    m.getTryOnStatus.mockImplementation(async (_p: string, jobId: string) => {
      await new Promise((r) => setTimeout(r, 5))
      active--
      return { data: { status: 'ready', url: `u-${jobId}` } }
    })
    const items = await run(4).p
    expect(peak).toBe(2)
    expect(items.map((i) => i.state)).toEqual(['ready', 'ready', 'ready', 'ready'])
    expect(items[0]).toMatchObject({ productId: 'p1', jobId: 'j-p1', url: 'u-j-p1' })
  })

  it('marks an unsupported-category 422 item failed and the rest ready', async () => {
    m.startTryOn.mockImplementation(async (pid: string) => {
      if (pid === 'p2') throw new FakeApiError('UNSUPPORTED_CATEGORY', 'Not supported', 422)
      return { data: { job_id: `j-${pid}`, status: 'pending' } }
    })
    const items = await run(4).p
    expect(items.map((i) => i.state)).toEqual(['ready', 'failed', 'ready', 'ready'])
    expect(items[1]!.error).toBe('Not supported')
  })

  it('stops starting jobs after PLAN_LIMIT_EXCEEDED', async () => {
    m.startTryOn.mockImplementation(async (pid: string) => {
      if (pid === 'p3') throw new FakeApiError('PLAN_LIMIT_EXCEEDED', 'Limit', 403)
      return { data: { job_id: `j-${pid}`, status: 'pending' } }
    })
    // p2 is still generating while p3 is rejected, so the second worker is
    // busy and p4 is still queued when the limit error lands.
    m.getTryOnStatus.mockImplementation(async (_p: string, jobId: string) => {
      if (jobId === 'j-p2') await new Promise((r) => setTimeout(r, 30))
      return { data: { status: 'ready', url: `u-${jobId}` } }
    })
    const items = await run(4).p
    expect(items.map((i) => i.state)).toEqual(['ready', 'ready', 'failed', 'failed'])
    expect(items[3]!.error).toBe('Try-on limit reached')
    expect(m.startTryOn).toHaveBeenCalledTimes(3)
    expect(m.startTryOn.mock.calls.map((c) => c[0])).not.toContain('p4')
  })

  it('makes no further POSTs after abort', async () => {
    const ac = new AbortController()
    m.startTryOn.mockImplementation(async (pid: string) => {
      if (pid === 'p1') ac.abort()
      return { data: { job_id: `j-${pid}`, status: 'pending' } }
    })
    const items = await run(4, ac.signal).p
    // p1 and p2 were already in flight when abort fired; p3/p4 must not start.
    expect(m.startTryOn.mock.calls.length).toBeLessThanOrEqual(2)
    expect(items[2]!.state).toBe('failed')
    expect(items[3]!.state).toBe('failed')
  })

  it('compresses once and uploads with skipCompress', async () => {
    const got: string[] = []
    await run(3, undefined, (u) => got.push(u)).p
    expect(m.compress).toHaveBeenCalledTimes(1)
    for (const c of m.startTryOn.mock.calls) {
      expect(c[2]).toBe('file:///cache/small.jpg')
      expect(c[3]).toEqual({ skipCompress: true })
    }
    expect(got).toEqual(['file:///cache/small.jpg'])
  })

  it('falls back to the original photo when compression throws', async () => {
    m.compress.mockRejectedValue(new Error('boom'))
    const got: string[] = []
    const items = await run(1, undefined, (u) => got.push(u)).p
    expect(items[0]!.state).toBe('ready')
    expect(m.startTryOn.mock.calls[0]![2]).toBe('file:///cache/cam.jpg')
    expect(got).toEqual([])
  })

  it('treats a failed status as terminal with the server message', async () => {
    m.getTryOnStatus.mockResolvedValue({ data: { status: 'failed', error: 'worker down' } })
    const items = await run(1).p
    expect(items[0]).toMatchObject({ state: 'failed', error: 'worker down' })
  })

  it('runs a duplicated product id only once', async () => {
    const items = await runTryOnSession({
      products: [
        { id: 'p1', name: 'A' },
        { id: 'p1', name: 'A' },
      ],
      photoUri: 'file:///cache/cam.jpg',
      consentVersion: 'v1',
      onItem: () => {},
      signal: new AbortController().signal,
    })
    expect(items).toHaveLength(1)
    expect(m.startTryOn).toHaveBeenCalledTimes(1)
  })
})

describe('cleanupSession', () => {
  it('deletes both URIs and discards every deduped job id even if discard rejects', async () => {
    m.discardTryOnJobs.mockRejectedValue(new Error('502'))
    await cleanupSession({
      photoUris: ['file:///cache/cam.jpg', 'file:///cache/small.jpg'],
      jobIds: ['a', 'b', 'a', ''],
    })
    expect(m.deleteAsync).toHaveBeenCalledWith('file:///cache/cam.jpg', { idempotent: true })
    expect(m.deleteAsync).toHaveBeenCalledWith('file:///cache/small.jpg', { idempotent: true })
    expect(m.discardTryOnJobs).toHaveBeenCalledTimes(1)
    expect(m.discardTryOnJobs).toHaveBeenCalledWith(['a', 'b'])
  })

  it('chunks discard calls by 10', async () => {
    const ids = Array.from({ length: 23 }, (_, i) => `j${i}`)
    await cleanupSession({ photoUris: [], jobIds: ids })
    expect(m.discardTryOnJobs.mock.calls.map((c) => c[0].length)).toEqual([10, 10, 3])
  })

  it('never deletes a URI outside the app cache and survives a delete failure', async () => {
    m.deleteAsync.mockRejectedValueOnce(new Error('nope'))
    await cleanupSession({
      photoUris: ['file:///cache/a.jpg', 'file:///gallery/orig.jpg', 'file:///cache/b.jpg'],
      jobIds: ['x'],
    })
    const deleted = m.deleteAsync.mock.calls.map((c) => c[0])
    expect(deleted).toEqual(['file:///cache/a.jpg', 'file:///cache/b.jpg'])
    expect(m.discardTryOnJobs).toHaveBeenCalledWith(['x'])
  })
})

describe('planSession', () => {
  const ps = products(4)
  it('runs the first `remaining` and skips the rest', () => {
    expect(planSession(ps, 2)).toEqual({ run: ps.slice(0, 2), skipped: ps.slice(2) })
  })
  it('runs all when remaining exceeds count', () => {
    expect(planSession(ps, 9)).toEqual({ run: ps, skipped: [] })
  })
  it('runs none when remaining <= 0', () => {
    expect(planSession(ps, 0)).toEqual({ run: [], skipped: ps })
    expect(planSession(ps, -3)).toEqual({ run: [], skipped: ps })
  })
})

describe('isAppCacheUri', () => {
  it('is true only inside a non-empty cache dir', () => {
    expect(isAppCacheUri('file:///cache/x.jpg', 'file:///cache/')).toBe(true)
    expect(isAppCacheUri('file:///gallery/x.jpg', 'file:///cache/')).toBe(false)
    expect(isAppCacheUri('file:///cache/x.jpg', '')).toBe(false)
    expect(isAppCacheUri('file:///cache/x.jpg', null)).toBe(false)
  })
})

// T6: the "Buy more try-ons" button shows only when this returns >= 1 pack.
describe('loadBuyablePacks', () => {
  const pack = { id: 'p1', label: '25 try-ons', pack_size: 25, price_paise: 23600 }
  it('returns the packs when there are some', async () => {
    m.tryOnPacks.mockResolvedValue({ data: [pack] })
    await expect(loadBuyablePacks()).resolves.toEqual([pack])
  })
  it('returns [] (button hidden) when none', async () => {
    m.tryOnPacks.mockResolvedValue({ data: [] })
    await expect(loadBuyablePacks()).resolves.toEqual([])
  })
  it('returns [] when the call fails (e.g. manager gets 403)', async () => {
    m.tryOnPacks.mockRejectedValue(new Error('403'))
    await expect(loadBuyablePacks()).resolves.toEqual([])
  })
})
