/**
 * Returns the URL only if it is http(s), else undefined. Use for any href that
 * comes from stored data (retailer/Meta/marketplace supplied): `javascript:` and
 * `data:` URLs execute in the page origin when clicked, which for admin pages is
 * the admin session.
 */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : undefined
  } catch {
    return undefined
  }
}
