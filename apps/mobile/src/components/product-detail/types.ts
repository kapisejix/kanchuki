// Auto-split from app/product/[id].tsx (1944 lines) — shared types for the
// product detail screen and its sub-components.
export type Photo = {
  id: string
  url: string
  is_primary: boolean
  piece_type: 'upper' | 'lower' | null
  original_url?: string | null
}
export type Variant = { id: string; color: string; photo_url: string | null }
export type Product = {
  id: string
  name: string | null
  sku: string | null
  description: string | null
  subtype: string | null
  category: string | null
  category_id: string | null
  product_type: string | null
  primary_color: string | null
  fabric_estimate: string | null
  fabrics: string[]
  styles: string[]
  pattern: string | null
  occasions: string[]
  sizes: string[]
  price_min: number | null
  price_max: number | null
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'NOT_SURE'
  location_notes: string | null
  notes: string | null
  ai_tagged: boolean
  ai_tag_error: string | null
  spin_status: string | null
  spin_error: string | null
  photos: Photo[]
  spin_frames: { id: string; url: string }[]
  variants: Variant[]
  section: { name: string } | null
}

export const STATUS_OPTIONS: { value: Product['status']; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NOT_SURE', label: 'Not Sure' },
]
