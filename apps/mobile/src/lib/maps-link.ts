// Pull a shop's coordinates out of a pasted Google Maps link, so a retailer can
// paste the "Share" link instead of standing in the shop with GPS on.

export type LatLng = { lat: number; lng: number }

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'
// Most specific first: !3d/!4d is the place pin; @lat,lng is only the map centre.
const PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|ll|query|destination|center)=${NUM}(?:,|%2C)\\s*${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
]

export function parseMapsLink(url: string): LatLng | null {
  for (const re of PATTERNS) {
    const m = re.exec(url)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return null
}

const SHORT_HOST = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i

/** Full links parse directly; short share links are followed to their final URL first. */
export async function resolveMapsLink(input: string): Promise<LatLng | null> {
  const url = input.trim()
  const direct = parseMapsLink(url)
  if (direct || !SHORT_HOST.test(url)) return direct
  try {
    const res = await fetch(url)
    return parseMapsLink(res.url)
  } catch {
    return null
  }
}
