import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── withRetry ────────────────────────────────────────────────────

// Import after vi.mock is set up
let withRetry: typeof import('./client.js').withRetry

beforeEach(async () => {
  vi.useFakeTimers()
  // Dynamic import to get a fresh module per test
  const mod = await import('./client.js')
  withRetry = mod.withRetry
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('withRetry', () => {
  it('returns result on first attempt (no retry)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on ECONNRESET and succeeds on second attempt', async () => {
    const error = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('recovered')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })
    // Advance past the first retry delay (100ms)
    await vi.advanceTimersByTimeAsync(100)
    const result = await resultPromise

    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on ETIMEDOUT', async () => {
    const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on Prisma P1001 (cannot reach database)', async () => {
    const error = new Error('P1001: Can\'t reach database server')
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('retries on Prisma P2024 (pool timeout)', async () => {
    const error = new Error('P2024: Timed out fetching a new connection from the pool')
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('retries on "Connection terminated" message', async () => {
    const error = new Error('Connection terminated unexpectedly')
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('retries on "Pool is full"', async () => {
    const error = new Error('Pool is full')
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('does NOT retry on constraint violation (P2002)', async () => {
    const error = new Error('P2002: Unique constraint failed')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 }),
    ).rejects.toThrow('P2002')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on not-found (P2025)', async () => {
    const error = new Error('P2025: Record not found')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 }),
    ).rejects.toThrow('P2025')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on generic application errors', async () => {
    const error = new Error('Business logic error')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 }),
    ).rejects.toThrow('Business logic error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('exhausts all attempts then throws the last error', async () => {
    const error = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    const fn = vi.fn().mockRejectedValue(error)

    // Catch the rejection to prevent unhandled rejection
    let caughtError: unknown
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })
      .catch((e: unknown) => { caughtError = e; })

    // Advance through retry 1 (100ms) and retry 2 (200ms)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(200)
    await promise

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toBe('ECONNRESET')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('uses exponential backoff (delay doubles each attempt)', async () => {
    const error = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })

    // First retry after 100ms (2^0 * 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(fn).toHaveBeenCalledTimes(2)

    // Second retry after 200ms more (2^1 * 100)
    await vi.advanceTimersByTimeAsync(200)
    expect(fn).toHaveBeenCalledTimes(3)

    const result = await resultPromise
    expect(result).toBe('ok')
  })

  it('retries on ECONNREFUSED', async () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('retries on EPIPE', async () => {
    const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result).toBe('ok')
  })

  it('respects custom label for logging', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50, label: 'my-op' })
    await vi.advanceTimersByTimeAsync(50)
    await resultPromise

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[db] my-op attempt 1/3'),
    )
    consoleSpy.mockRestore()
  })
})

// ─── dbHealthCheck ─────────────────────────────────────────────────
// Covered by apps/api/src/routes/health.test.ts (integration test with
// mocked DB + Redis). The dbHealthCheck function is a thin wrapper around
// prisma.$queryRaw`SELECT 1` — no additional unit tests needed here.
