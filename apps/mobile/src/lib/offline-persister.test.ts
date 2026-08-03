import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  persistQueryCache,
  restoreQueryCache,
  clearPersistedCache,
} from './offline-persister'

// Same in-memory expo-file-system mock as mutation-queue.test.ts — the
// persister writes real JSON through the File/Directory classes, so the
// persist → restore round-trip is exercised (not a stubbed return).
const { memory, FakeFile, FakeDirectory } = vi.hoisted(() => {
  const memory = new Map<string, string>()

  class FakeDirectory {
    uri: string
    exists = true
    constructor(uri: string) {
      this.uri = uri
    }
    create(): void {}
    delete(): void {}
  }

  class FakeFile {
    uri: string
    exists: boolean
    constructor(uri: string) {
      this.uri = uri
      this.exists = memory.has(uri)
    }
    create(_opts?: { overwrite?: boolean }): void {
      if (!memory.has(this.uri)) {
        memory.set(this.uri, '')
        this.exists = true
      }
    }
    write(content: string): void {
      memory.set(this.uri, content)
      this.exists = true
    }
    async text(): Promise<string> {
      return memory.get(this.uri) ?? ''
    }
    delete(): void {
      memory.delete(this.uri)
      this.exists = false
    }
  }

  return { memory, FakeFile, FakeDirectory }
})

vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: FakeFile,
  Directory: FakeDirectory,
}))

const CACHE_FILE_URI = 'file:///documents/kanchuki-cache/rq-cache.json'

/** Minimal React Query query-shaped object. */
function makeQuery(
  key: string[],
  data: unknown,
  opts: { stale?: boolean } = {},
) {
  return {
    queryHash: JSON.stringify(key),
    queryKey: key,
    gcTime: 5 * 60 * 1000,
    state: {
      data,
      dataUpdateCount: 1,
      dataUpdatedAt: 1700000000000,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchMeta: null,
      isInvalidated: false,
      status: 'success',
      fetchStatus: 'idle',
    },
    isStaleByTime: () => opts.stale ?? false,
  }
}

/** Minimal React Query client exposing only what the persister touches. */
function makeClient(queries: unknown[] = []) {
  return {
    getQueryCache: () => ({ getAll: () => queries }),
    setQueryData: vi.fn(),
  }
}

describe('offline-persister', () => {
  beforeEach(() => {
    memory.clear()
  })

  it('returns false when no cache file exists yet', async () => {
    expect(await restoreQueryCache(makeClient())).toBe(false)
  })

  it('persists non-stale queries and restores them via setQueryData', async () => {
    const client = makeClient([
      makeQuery(['catalog'], { products: [1, 2, 3] }),
      makeQuery(['product', 'p1'], { id: 'p1', name: 'Kurta' }),
    ])

    persistQueryCache(client)

    // File was written with both queries.
    expect(memory.has(CACHE_FILE_URI)).toBe(true)
    const raw = JSON.parse(memory.get(CACHE_FILE_URI)!)
    expect(raw.version).toBe(1)
    expect(raw.queries).toHaveLength(2)
    expect(raw.queries[0].queryKey).toEqual(['catalog'])

    // Restore into a fresh client.
    const fresh = makeClient()
    const restored = await restoreQueryCache(fresh)
    expect(restored).toBe(true)
    expect(fresh.setQueryData).toHaveBeenCalledTimes(2)
    expect(fresh.setQueryData).toHaveBeenCalledWith(
      ['catalog'],
      { products: [1, 2, 3] },
      expect.any(Object),
    )
  })

  it('skips stale and data-less queries entirely (no file written)', () => {
    const client = makeClient([
      makeQuery(['stale'], { a: 1 }, { stale: true }),
      { queryHash: 'x', queryKey: ['empty'], state: { data: null }, isStaleByTime: () => false },
    ])

    persistQueryCache(client)
    expect(memory.has(CACHE_FILE_URI)).toBe(false)
  })

  it('clears the file and returns false on a version mismatch', async () => {
    memory.set(
      CACHE_FILE_URI,
      JSON.stringify({ version: 999, timestamp: Date.now(), queries: [] }),
    )

    expect(await restoreQueryCache(makeClient())).toBe(false)
    expect(memory.has(CACHE_FILE_URI)).toBe(false)
  })

  it('clears a cache older than 24 hours', async () => {
    memory.set(
      CACHE_FILE_URI,
      JSON.stringify({
        version: 1,
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
        queries: [{ queryKey: ['old'], state: { data: { x: 1 } } }],
      }),
    )

    expect(await restoreQueryCache(makeClient())).toBe(false)
    expect(memory.has(CACHE_FILE_URI)).toBe(false)
  })

  it('clears the file and returns false on corrupt JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    memory.set(CACHE_FILE_URI, '{not json')

    try {
      expect(await restoreQueryCache(makeClient())).toBe(false)
      expect(memory.has(CACHE_FILE_URI)).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it('clearPersistedCache deletes an existing cache file', async () => {
    persistQueryCache(
      makeClient([makeQuery(['catalog'], { products: [1] })]),
    )
    expect(memory.has(CACHE_FILE_URI)).toBe(true)

    await clearPersistedCache()
    expect(memory.has(CACHE_FILE_URI)).toBe(false)
  })
})
