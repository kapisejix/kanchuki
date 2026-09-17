// `return_to` — the post-login destination carried through a passport bounce.
//
// The (shopper) layout bounces an unauthenticated visitor off /my-stores to the
// login surface with `?return_to=<path>`, and the login flow navigates there on
// success. That makes the parameter an **attacker-controllable navigation
// target**, so it is validated at the navigation boundary — not only at the
// write site — and this module is the single place that decision is made.
//
// Threat model (open redirect → phishing): `?return_to=https://evil.example`
// would let an attacker bounce a shopper off kanchuki.app to a convincing
// clone right after they entered an OTP. Every rule below closes one way of
// expressing a cross-origin target, including the ones that only become
// visible after percent-decoding.
//
// The page that lands on a bad value still works — it just goes to the default
// destination — so this fails closed and never throws.

/** Where a shopper goes when no usable target was supplied. */
export const DEFAULT_RETURN_TO = '/my-stores'

/** The query parameter the (shopper) layout writes and the login flow reads. */
export const RETURN_TO_PARAM = 'return_to'

/**
 * Longest target we will honour. Real destinations are paths plus a small
 * query string; anything longer is not something we generated.
 */
const MAX_LENGTH = 512

/**
 * How many times to percent-decode before validating. One pass is not enough:
 * `%252F%252Fevil` decodes to `%2F%2Fevil`, which a browser would then decode
 * to `//evil`. Bounded so a pathological input can't spin.
 */
const MAX_DECODE_PASSES = 3

/** Sentinel origin: never navigated to, only used to detect cross-origin. */
const SENTINEL_ORIGIN = 'http://return-to.invalid'

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    // Malformed escape (e.g. a lone `%`) — keep the raw form and let the
    // checks below judge it.
    return value
  }
}

/**
 * Reduce any input to a same-origin absolute path, or the fallback.
 *
 * @param raw The parameter value as read from the URL (or any untrusted input).
 * @param fallback Destination when `raw` is unusable. Must itself be safe —
 *   only ever passed constants from this repo.
 */
export function sanitizeReturnTo(raw: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof raw !== 'string') return fallback

  let candidate = raw.trim()
  if (candidate === '' || candidate.length > MAX_LENGTH) return fallback

  // Decode to a fixed point before deciding anything: `%2F%2Fevil.com` and
  // `%6Aavascript:` only reveal their true shape once decoded.
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    const decoded = decodeOnce(candidate)
    if (decoded === candidate) break
    candidate = decoded
  }

  // Must be a path on this origin.
  if (!candidate.startsWith('/')) return fallback
  // `//evil.com` is protocol-relative — a different origin.
  if (candidate.startsWith('//')) return fallback
  // Browsers normalise `\` to `/` in special-scheme URLs, so `/\evil.com`
  // resolves to `//evil.com`. Reject the character outright: no legitimate
  // destination in this app contains one.
  if (candidate.includes('\\')) return fallback
  // Control characters (CR/LF/NUL/tab) — request-splitting style payloads.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: detecting them is the point
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return fallback

  // Final gate: resolve it and require the result to stay on the sentinel
  // origin, rather than trusting the string checks above to have been
  // exhaustive. Anything absolute (`https:`, `javascript:`, `data:`) resolves
  // elsewhere or throws.
  try {
    const resolved = new URL(candidate, SENTINEL_ORIGIN)
    if (resolved.origin !== SENTINEL_ORIGIN) return fallback
    // Rebuilt from parsed parts so the value we hand to the router is
    // normalised, never the raw string.
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}

/** Convenience reader for `URLSearchParams` / Next's `searchParams`. */
export function readReturnTo(get: (key: string) => string | null, fallback?: string): string {
  return sanitizeReturnTo(get(RETURN_TO_PARAM), fallback)
}
