// Types + server-fetch helpers shared by the storefront Suits Designs pages
// (/{store}/designs browse + /{store}/designs/[id] permalink). Mirrors the
// shapes returned by GET /v1/public/showcase-designs (docs/tasks/suits-designs.md
// §5 public routes) — no retailer r2 keys or inactive rows ever reach here.

export interface PublicShowcaseDesign {
  id: string
  name: string | null
  image_url: string
  category: { slug: string; name: string | null }
  // Global rows (retailer_id null) have no owning store.
  store: { shop_name: string | null; slug: string | null } | null
}

export interface PublicShowcaseDesignDetail {
  id: string
  name: string | null
  image_url: string
  category: { slug: string; name: string | null }
  store: { shop_name: string | null; slug: string | null } | null
  created_at: string
}

export interface BrowseResponse {
  designs: PublicShowcaseDesign[]
  // Expanded category slugs only when a ?category= filter is active — the
  // browser derives its chip list from this plus the returned rows' categories.
  related: string[]
  next_cursor: string | null
}
