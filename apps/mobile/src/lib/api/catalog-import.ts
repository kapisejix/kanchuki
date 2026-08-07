import { request } from './client'

// ─── Catalog Import (F-001b / F-001c) ────────────────────────────

export type CatalogDetectedItem = {
  description: string
  cropped_url: string
  cropped_r2_key: string
  page_number?: number
  phash: string
  is_duplicate: boolean
  duplicate_of_product_id: string | null
  tags: {
    category: string | null
    subtype: string | null
    product_name: string | null
    short_description: string | null
    primary_color: string | null
    secondary_colors: string[]
    fabric_estimate: string | null
    pattern: string | null
    embellishments: string[]
    neck_style: string | null
    sleeve_type: string | null
    occasions: string[]
    style: string[]
    fabrics: string[]
    price_range_estimate: string | null
    design_number_visible: string | null
    is_catalog_image: boolean
    search_tags: string[]
  }
}

export const catalogImportApi = {
  /**
   * Get a presigned upload URL for a catalog import source image or PDF.
   */
  getUploadUrl: (filename: string, contentType: string, sizeBytes: number) =>
    request<{
      data: {
        upload_url: string
        r2_key: string
        public_url: string
        expires_in: number
      }
    }>('/v1/catalog-import/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, size_bytes: sizeBytes }),
      timeoutMs: 30_000,
    }),

  /**
   * F-001c: Detect multiple garments in a single catalog/product photo.
   * Upload the source image first via getUploadUrl, then pass the public_url.
   */
  detectItems: (imageUrl: string) =>
    request<{
      data: {
        source_type: 'image'
        total_items: number
        items: CatalogDetectedItem[]
      }
    }>('/v1/catalog-import/detect-items', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl }),
      timeoutMs: 60_000, // Claude Vision + cropping + re-tagging takes time
    }),

  /**
   * F-001b: Import a PDF catalog. If page_images[] is provided, runs
   * multi-item detection on each page. If not, returns PDF metadata.
   */
  importPdf: (pdfUrl: string, pageImages?: string[]) =>
    request<{
      data: {
        source_type: 'pdf'
        total_items: number
        total_pages: number
        page_dimensions?: { width: number; height: number }[]
        items: CatalogDetectedItem[]
        render_required?: boolean
        max_page_images?: number
      }
    }>('/v1/catalog-import/import-pdf', {
      method: 'POST',
      body: JSON.stringify({
        pdf_url: pdfUrl,
        ...(pageImages ? { page_images: pageImages } : {}),
      }),
      timeoutMs: 180_000, // PDF processing + detection can be slow
    }),

  /**
   * Save reviewed items as real products in one batch.
   */
  bulkCreateProducts: (
    items: {
      cropped_r2_key: string
      cropped_url: string
      category?: string | null
      primary_color?: string | null
      fabric_estimate?: string | null
      pattern?: string | null
      subtype?: string | null
      product_name?: string | null
      short_description?: string | null
      occasions?: string[]
      styles?: string[]
      fabrics?: string[]
      search_tags?: string[]
      sizes?: string[]
      price_min?: number | null
      price_max?: number | null
      section_id?: string | null
      phash?: string | null
    }[],
    default_section_id?: string | null,
  ) =>
    request<{
      data: {
        total_requested: number
        total_created: number
        products: { id: string; cropped_url: string }[]
      }
    }>('/v1/catalog-import/bulk-create-products', {
      method: 'POST',
      body: JSON.stringify({ items, default_section_id }),
      timeoutMs: 60_000,
    }),
}
