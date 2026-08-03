import dns from 'node:dns/promises'
import { isIP } from 'node:net'

// Every caller here fetches a URL supplied by a customer, retailer, or a
// third-party import (customer_photo_url on the unauthenticated try-on
// endpoint, product/collection photo URLs, PDF catalog import URLs). Without
// these checks any of those routes lets a caller make the server issue a
// request to its own private network or cloud metadata endpoint (SSRF).

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 25 * 1024 * 1024 // generous ceiling for a single photo/PDF

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    const a = parts[0]!
    const b = parts[1]!
    if (a === 127 || a === 10 || a === 0 || a >= 224) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local, incl. 169.254.169.254 cloud metadata
    return false
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('::ffff:')) return isPrivateOrReservedIp(lower.slice(7))
    return false
  }
  return true // not a parseable IP literal — reject closed
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error(`Blocked unsafe address: ${hostname}`)
    return
  }
  const records = await dns.lookup(hostname, { all: true })
  for (const { address } of records) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(`Blocked unsafe address: ${hostname} -> ${address}`)
    }
  }
}

/**
 * fetch() hardened against SSRF for URLs supplied by users/third parties:
 * blocks private/loopback/link-local/metadata IPs (checked on the initial
 * host and again on every redirect hop), caps redirects, request duration,
 * and declared response size. Always pair with readCappedBuffer() below
 * instead of res.arrayBuffer() so an undeclared/chunked body can't exceed
 * the cap either.
 *
 * ponytail: resolve-then-check leaves a DNS-rebinding TOCTOU window (DNS
 * could repoint between our check and the actual connect). Closing that
 * fully needs pinning the resolved IP at the connection layer (an undici
 * dispatcher with a custom `lookup`), which isn't worth a new dependency
 * unless a threat model requires defending against an attacker who also
 * controls DNS TTLs in real time — upgrade if that changes.
 */
export async function ssrfSafeFetch(inputUrl: string, init?: RequestInit): Promise<Response> {
  let currentUrl = inputUrl
  for (let redirects = 0; ; redirects++) {
    const parsed = new URL(currentUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Blocked unsupported protocol: ${parsed.protocol}`)
    }
    await assertPublicHost(parsed.hostname)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(parsed.toString(), {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Redirect with no Location header')
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects')
      currentUrl = new URL(location, parsed).toString()
      continue
    }

    const contentLength = Number(res.headers?.get('content-length') ?? '0')
    if (contentLength > MAX_BYTES) throw new Error(`Response too large: ${contentLength} bytes`)

    return res
  }
}

/** Reads a Response body into a Buffer, enforcing MAX_BYTES even without a Content-Length header. */
export async function readCappedBuffer(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader()
  if (!reader) return Buffer.from(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new Error(`Response exceeded ${MAX_BYTES} byte cap`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
