// Outbound HTTP must never wait forever: a hung Resend/Meta/Razorpay socket
// otherwise pins the request (or a whole Promise.allSettled fan-out) until the
// platform kills it (RC-110). Same shape as razorpayx.ts: a caller-supplied
// signal wins, otherwise AbortSignal.timeout. `fetch` is resolved at call time
// so tests that stub globalThis.fetch keep working.
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return globalThis.fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
