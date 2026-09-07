import { request } from './client'

// ─── Suits Designs (docs/tasks/suits-designs.md) ────────────────────
// Retailer manages their own designs + sees admin-global ones; the public
// endpoints power the customer product-detail strip, the "View more" browse
// feed, and the public permalink. All read shapes mirror the API responses.

export type ShowcaseDesignRow = {
  id: string
  name: string | null
  image_url: string
  category_id: string
  category_slug: string
  category_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // 'global' = admin-published (read-only here), 'self' = this retailer.
  owner: 'global' | 'self'
}

export type ShowcaseDesignCategory = {
  id: string
  name: string
  slug: string
  sort_order: number
  // The "also show" expansion set (symmetric self-M2M, admin-edited).
  related: { id: string; name: string; slug: string }[]
}

export type ShowcaseUsage = { used: number; limit: number | null }

export type PublicShowcaseDesign = {
  id: string
  name: string | null
  image_url: string
  category: { slug: string; name: string | null }
  store: { shop_name: string | null; slug: string | null } | null
}

export type PublicShowcaseDesignDetail = {
  id: string
  name: string | null
  image_url: string
  category: { slug: string; name: string | null }
  store: { shop_name: string | null; slug: string | null } | null
  created_at: string
}

export const showcaseDesignsApi = {
  // ── Retailer (own + global rows) ──────────────────────────────────
  listMine: (category?: string) =>
    request<{ data: ShowcaseDesignRow[] }>(
      `/v1/retailers/me/showcase-designs${category ? `?category=${encodeURIComponent(category)}` : ''}`,
      { getCacheTtlMs: 15_000 },
    ),

  categories: () =>
    request<{ data: ShowcaseDesignCategory[] }>('/v1/retailers/me/showcase-designs/categories', {
      getCacheTtlMs: 60_000,
    }),

  usage: () =>
    request<{ data: ShowcaseUsage }>('/v1/retailers/me/showcase-designs/usage', {
      getCacheTtlMs: 30_000,
    }),

  getUploadUrl: (contentType: string) =>
    request<{
      data: { upload_url: string; r2_key: string; public_url: string; expires_in: number }
    }>('/v1/retailers/me/showcase-designs/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename: 'design.jpg', content_type: contentType }),
      timeoutMs: 30_000,
    }),

  /** AI auto-suggested name + color for a just-uploaded raw design photo. */
  suggest: (rawR2Key: string) =>
    request<{ data: { name: string | null; color: string | null } }>(
      '/v1/retailers/me/showcase-designs/suggest',
      {
        method: 'POST',
        body: JSON.stringify({ raw_r2_key: rawR2Key }),
        timeoutMs: 45_000,
      },
    ),

  create: (data: { category_id: string; name?: string | null; raw_r2_key: string }) =>
    request<{ data: ShowcaseDesignRow }>('/v1/retailers/me/showcase-designs', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 45_000,
    }),

  update: (
    id: string,
    data: {
      category_id?: string
      name?: string | null
      is_active?: boolean
      sort_order?: number
      raw_r2_key?: string
    },
  ) =>
    request<{ data: ShowcaseDesignRow }>(`/v1/retailers/me/showcase-designs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      timeoutMs: 45_000,
    }),

  remove: (id: string) => request<void>(`/v1/retailers/me/showcase-designs/${id}`, { method: 'DELETE' }),

  // ── Public (customer storefront) ──────────────────────────────────
  publicForProduct: (productId: string) =>
    request<{
      data: {
        designs: PublicShowcaseDesign[]
        category: { slug: string; name: string; related: string[] } | null
      }
    }>(`/v1/public/showcase-designs?product_id=${encodeURIComponent(productId)}`, {
      getCacheTtlMs: 60_000,
    }),

  publicBrowse: (store: string, category?: string) =>
    request<{
      data: { designs: PublicShowcaseDesign[]; related: string[]; next_cursor: string | null }
    }>(
      `/v1/public/showcase-designs?store=${encodeURIComponent(store)}${category ? `&category=${encodeURIComponent(category)}` : ''}`,
      { getCacheTtlMs: 60_000 },
    ),

  publicOne: (id: string) =>
    request<{ data: PublicShowcaseDesignDetail }>(`/v1/public/showcase-designs/${id}`, {
      getCacheTtlMs: 60_000,
    }),
}