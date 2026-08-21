// ─── API Response Envelope ────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
  pagination?: Pagination
}

export interface ApiError {
  error: {
    code: string
    message: string
    field?: string
    status: number
  }
}

export interface Pagination {
  cursor: string | null
  has_more: boolean
  total?: number
}

// ─── Retailer ────────────────────────────────────────────────────

export interface RetailerProfile {
  id: string
  phone: string
  shop_name: string
  owner_name: string | null
  city: string
  state: string | null
  gstin: string | null
  categories: string[]
  plan: PlanType
  plan_status: PlanStatus
  trial_ends_at: string | null
  plan_expires_at: string | null
  max_products: number
  max_customers: number
  try_on_credits: number
  onboarding_completed: boolean
  onboarding_step: number
  created_at: string
}

export type PlanType = 'STARTER' | 'GROWTH' | 'PRO'
export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'

// ─── Products ────────────────────────────────────────────────────

export type ProductStatus = 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'NOT_SURE'

export interface ProductSummary {
  id: string
  retailer_id: string
  name: string | null
  price_min: number | null  // paise
  price_max: number | null  // paise
  status: ProductStatus
  category: string | null
  primary_color: string | null
  secondary_colors: string[]
  search_tags: string[]
  ai_tagged: boolean
  primary_photo_url: string | null
  section: { name: string } | null
  location_notes: string | null
  created_at: string
}

export interface ProductDetail extends ProductSummary {
  product_type: string | null
  fabric_estimate: string | null
  fabrics: string[]
  styles: string[]
  pattern: string | null
  embellishments: string[]
  neck_style: string | null
  sleeve_type: string | null
  mrp: number | null
  notes: string | null
  metadata: Record<string, unknown> | null
  photos: ProductPhotoItem[]
  variants: ProductVariantItem[]
}

export interface ProductPhotoItem {
  id: string
  url: string
  is_primary: boolean
  sort_order: number
}

export interface ProductVariantItem {
  id: string
  color: string
  photo_url: string | null
  ai_preview_url: string | null
  is_ai_preview: boolean
  status: ProductStatus
  price_override: number | null
}

export interface AiTagResult {
  category: string | null
  subtype: string | null
  product_type: string | null
  primary_color: string | null
  secondary_colors: string[]
  fabric_estimate: string | null
  pattern: string | null
  embellishments: string[]
  neck_style: string | null
  sleeve_type: string | null
  style: string[]
  fabrics: string[]
  price_range_estimate: string | null
  design_number_visible: string | null
  is_catalog_image: boolean
  search_tags: string[]
  confidence_notes: string | null
  product_name: string | null
  short_description: string | null
}

// ─── Customers ───────────────────────────────────────────────────

export interface CustomerSummary {
  id: string
  retailer_id: string
  name: string
  phone: string
  pref_colors: string[]
  pref_styles: string[]
  pref_fabrics: string[]
  budget_min: number | null  // paise
  budget_max: number | null  // paise
  notes: string | null
  last_visit_at: string | null
  total_purchases: number
  total_spent: number
  created_at: string
}

// ─── Collections ─────────────────────────────────────────────────

export type CollectionStatus = 'ACTIVE' | 'EXPIRED' | 'ARCHIVED'

export interface CollectionSummary {
  id: string
  retailer_id: string
  title: string
  description: string | null
  slug: string
  url: string
  status: CollectionStatus
  expires_at: string | null
  view_count: number
  unique_viewer_count: number
  enquiry_count: number
  favorite_count: number
  product_count: number
  created_at: string
}

export interface CollectionDetail extends CollectionSummary {
  products: ProductSummary[]
  enquiries: CollectionEnquiryItem[]
}

export interface CollectionEnquiryItem {
  id: string
  product_id: string | null
  message: string | null
  customer_name: string | null
  customer_phone: string | null
  status: 'NEW' | 'SEEN' | 'REPLIED' | 'CLOSED'
  created_at: string
}

// ─── Public Collection (customer-facing, no auth) ────────────────

export interface PublicCollection {
  // F-015: set when the retailer is suspended — retailer/products fields
  // below are not populated in that case, render a notice instead.
  suspended?: boolean
  retailer: {
    id: string
    shop_name: string
    city: string
    phone: string  // for WhatsApp enquiry
    logo_url: string | null
    banner_url: string | null
    // Store URL segment (public_slug). Null when the retailer has no store
    // QR — the collection then lives at the legacy /c/{slug} URL.
    public_slug: string | null
  }
  title: string
  description: string | null
  expires_at: string | null
  products: PublicProduct[]
  total: number
  page: number
  page_size: number
  filters: {
    categories: { value: string; count: number }[]
    colors: { value: string; count: number }[]
  }
}

// Thin shape for grid/list views — excludes per-product arrays (photos,
// spin_frames, variants) that require presigning every URL. Fetch
// PublicProductDetail on demand (product detail sheet) instead.
export interface PublicProduct {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  // F-024: virtual query-time flags (created_at within 30 days / mrp > price)
  is_new_arrival: boolean
  on_sale: boolean
  status: ProductStatus
  category: string | null
  subtype: string | null
  primary_color: string | null
  location: string | null
  primary_photo_url: string
  has_360: boolean
  avg_rating: number
  rating_count: number
}

export interface PublicProductDetail extends PublicProduct {
  secondary_colors: string[]
  fabric_estimate: string | null
  description: string | null
  search_tags: string[]
  sizes: string[]
  photos: string[]
  spin_frames: string[]
  variants: { color: string; photo_url: string | null; status: ProductStatus }[]
  is_unstitched?: boolean
}

// ─── Search ──────────────────────────────────────────────────────

export interface SearchFilters {
  status?: ProductStatus[]
  category?: string
  price_max?: number  // paise
  price_min?: number  // paise
  colors?: string[]
  limit?: number
}

export interface SearchResult {
  products: ProductSummary[]
  query_interpretation: {
    detected_colors: string[]
    detected_fabrics: string[]
    detected_budget_max: number | null
  }
  total_found: number
}

// ─── Upload ───────────────────────────────────────────────────────

export interface UploadUrlResponse {
  upload_url: string
  r2_key: string
  public_url: string
  expires_in: number  // seconds
}

// ─── Store Structure ──────────────────────────────────────────────

export interface StoreSectionItem {
  id: string
  name: string
  type: string
  parent_id: string | null
  sort_order: number
  children: StoreSectionItem[]
}
