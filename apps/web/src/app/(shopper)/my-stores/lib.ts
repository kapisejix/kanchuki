// F-036 Phase A (Task 1) — pure helpers behind the /my-stores list.
//
// Kept out of the page component so the shape-handling rules are testable on
// their own: the API scopes the list to the signed-in passport (that is the
// only place cross-customer leakage can be prevented), so this layer's job is
// to render exactly what came back — never add a row, never carry one over
// from a previous render.

export interface StoreVisitRow {
  retailer_id: string
  shop_name: string
  city: string | null
  logo_url: string | null
  slug: string | null
  /** Catalog link, or null when the store has no storefront slug yet. */
  href: string | null
  last_visited_at: string
  visit_count: number
  is_muted: boolean
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Map a `GET /api/passport/stores` payload to renderable rows, newest visit
 * first. Unusable entries are dropped rather than rendered as blank cards.
 */
export function mapStoreVisits(payload: unknown): StoreVisitRow[] {
  const stores = (payload as { stores?: unknown } | null | undefined)?.stores
  if (!Array.isArray(stores)) return []

  const rows: StoreVisitRow[] = []
  for (const entry of stores) {
    if (!entry || typeof entry !== 'object') continue
    const visit = entry as Record<string, unknown>
    const retailer = visit.retailer
    if (!retailer || typeof retailer !== 'object') continue

    const record = retailer as Record<string, unknown>
    const id = asNonEmptyString(record.id)
    const shopName = asNonEmptyString(record.shop_name)
    if (!id || !shopName) continue

    const slug = asNonEmptyString(record.public_slug)
    rows.push({
      retailer_id: id,
      shop_name: shopName,
      city: asNonEmptyString(record.city),
      logo_url: asNonEmptyString(record.logo_url),
      slug,
      href: slug ? `/${slug}` : null,
      last_visited_at: asNonEmptyString(visit.last_visited_at) ?? '',
      visit_count: typeof visit.visit_count === 'number' ? visit.visit_count : 0,
      is_muted: visit.is_muted === true,
    })
  }

  // The API already orders by last_visited_at desc; re-sort defensively so the
  // list can't silently reorder if the payload ever changes. Rows with an
  // unusable timestamp go last rather than jumping to the top.
  return rows.sort((a, b) => {
    const aTime = Date.parse(a.last_visited_at)
    const bTime = Date.parse(b.last_visited_at)
    if (Number.isNaN(aTime)) return Number.isNaN(bTime) ? 0 : 1
    if (Number.isNaN(bTime)) return -1
    return bTime - aTime
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Human label for a visit timestamp: relative for the last week, then a plain
 * date. Returns '' for an unusable timestamp so callers can omit the line.
 */
export function formatLastVisit(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const diffMs = now.getTime() - then
  if (diffMs < 60_000) return 'Just now'

  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins} min ago`

  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return `${hours} hr ago`

  const days = Math.floor(diffMs / 86_400_000)
  if (days <= 7) return days === 1 ? '1 day ago' : `${days} days ago`

  const d = new Date(then)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
