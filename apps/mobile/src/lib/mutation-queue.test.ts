import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueueStatusMutation,
  dequeueStatusMutation,
  getQueue,
  isRetryable,
} from './mutation-queue'
import { ApiError } from './api/api-error'

// In-memory expo-file-system mock. The queue writes real JSON through the
// File/Directory classes, so this exercises the actual enqueue → getQueue →
// dequeue round-trip (not a stubbed return). Paths.document.uri is a plain
// string, matching the native module's shape.
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

describe('mutation-queue', () => {
  beforeEach(() => {
    memory.clear()
  })

  it('returns an empty queue when no file exists yet', async () => {
    expect(await getQueue()).toEqual([])
  })

  it('persists an enqueued status mutation and reads it back', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD')

    const queue = await getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ productId: 'prod-1', status: 'SOLD' })
    expect(typeof queue[0]?.id).toBe('string')
    expect(typeof queue[0]?.queuedAt).toBe('number')
  })

  it('appends multiple mutations in order', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD')
    await enqueueStatusMutation('prod-2', 'RESERVED')

    const queue = await getQueue()
    expect(queue.map((m) => [m.productId, m.status])).toEqual([
      ['prod-1', 'SOLD'],
      ['prod-2', 'RESERVED'],
    ])
  })

  it('dequeues only the matching mutation', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD')
    await enqueueStatusMutation('prod-2', 'RESERVED')

    const queue = await getQueue()
    await dequeueStatusMutation(queue[0]!.id)

    const remaining = await getQueue()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.productId).toBe('prod-2')
  })

  it('survives a "restart" — persisted JSON is re-read from the same file', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD')

    // The file bytes persist in `memory`, which the File mock treats as
    // already-existing on re-construction — same as reading back from disk.
    const reloaded = await getQueue()
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]?.productId).toBe('prod-1')
  })

  it('returns an empty queue on corrupt JSON instead of throwing', async () => {
    memory.set('file:///documents/kanchuki-cache/mutation-queue.json', '{not json')
    expect(await getQueue()).toEqual([])
  })

  it('swallows write failures (offline/disk errors never throw to the caller)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const originalWrite = FakeFile.prototype.write
    FakeFile.prototype.write = () => {
      throw new Error('disk full')
    }
    try {
      await enqueueStatusMutation('prod-1', 'SOLD')
      // Failed write must not throw — the queue call completes silently,
      // and no partial/corrupt state is left behind.
      expect(await getQueue()).toEqual([])
    } finally {
      FakeFile.prototype.write = originalWrite
      warn.mockRestore()
    }
  })
})

// RC-115: a 4xx can never succeed on replay, so queueing it loops forever.
describe('isRetryable', () => {
  it.each([
    ['network failure (status 0)', new ApiError('NETWORK_ERROR', 'x', 0), true],
    ['timeout (408)', new ApiError('TIMEOUT', 'x', 408), true],
    ['rate limited (429)', new ApiError('RATE_LIMITED', 'x', 429), true],
    ['server error (500)', new ApiError('INTERNAL', 'x', 500), true],
    ['bad gateway (502)', new ApiError('BAD_GATEWAY', 'x', 502), true],
    ['validation (422)', new ApiError('VALIDATION', 'x', 422), false],
    ['not found (404)', new ApiError('NOT_FOUND', 'x', 404), false],
    ['forbidden (403)', new ApiError('FORBIDDEN', 'x', 403), false],
    ['unauthorized (401)', new ApiError('UNAUTHORIZED', 'x', 401), false],
  ])('%s', (_label, err, expected) => {
    expect(isRetryable(err)).toBe(expected)
  })

  it('treats a non-ApiError throw (raw fetch failure) as retryable', () => {
    expect(isRetryable(new TypeError('Network request failed'))).toBe(true)
  })
})
