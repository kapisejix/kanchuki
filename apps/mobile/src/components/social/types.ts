/**
 * A product the retailer has added to the post. Kept intentionally minimal —
 * the summary fields every picker needs (list + deep-link detail both supply
 * them) plus the id the media strip + payload resolve against.
 */
export interface ComposeProduct {
  id: string
  name: string | null
  primary_photo_url: string | null
  price_min: number | null // paise
  price_max: number | null // paise
}

/** The one media chosen for a product — photo XOR video. */
export interface ComposeMedia {
  kind: 'photo' | 'video'
  photo_id?: string
  video_id?: string
  url: string
}
