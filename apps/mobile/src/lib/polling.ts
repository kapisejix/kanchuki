/**
 * Exponential backoff polling utility for async jobs (try-on, studio shoots).
 *
 * Starts at `initialMs`, doubles each tick up to `maxMs`, and stops after
 * `maxAttempts` or when the callback returns `true` (success/cancel).
 *
 * Returns a cleanup function that clears the timer.
 */
export function pollWithBackoff(opts: {
  /** First poll delay in ms (default 2000) */
  initialMs?: number
  /** Maximum delay between polls in ms (default 16000) */
  maxMs?: number
  /** Stop after this many attempts (default 60) */
  maxAttempts?: number
  /** Async callback — return `true` to stop polling (job done or failed) */
  onPoll: () => Promise<boolean>
}): () => void {
  const { initialMs = 2000, maxMs = 16_000, maxAttempts = 60, onPoll } = opts
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const tick = async () => {
    if (stopped) return
    attempt++

    try {
      const done = await onPoll()
      if (done || stopped) return
    } catch {
      // Transient failure — keep polling
    }

    if (attempt >= maxAttempts) return

    const delay = Math.min(initialMs * Math.pow(2, attempt - 1), maxMs)
    timer = setTimeout(tick, delay)
  }

  // First poll fires immediately (the job was just enqueued)
  void tick()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
