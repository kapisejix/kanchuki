import { request } from './client'

// ─── Product Categories ────────────────────────────────────────────

export type ProductCategory = {
  id: string
  name: string
  image_url: string | null
  sort_order: number
  product_count: number
}

export const categoryApi = {
  list: () => request<{ data: ProductCategory[] }>('/v1/categories', { getCacheTtlMs: 15_000 }),

  get: (id: string) =>
    request<{ data: ProductCategory }>(`/v1/categories/${id}`, { getCacheTtlMs: 15_000 }),

  create: (data: { name: string; image_url?: string; image_r2_key?: string }) =>
    request<{ data: ProductCategory }>('/v1/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; image_url?: string | null; image_r2_key?: string | null }) =>
    request<{ data: ProductCategory }>(`/v1/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/categories/${id}`, { method: 'DELETE' }),

  getUploadUrl: (contentType: string, sizeBytes: number) =>
    request<{
      data: { upload_url: string; r2_key: string; public_url: string; expires_in: number }
    }>('/v1/categories/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename: 'category.jpg', content_type: contentType, size_bytes: sizeBytes }),
      timeoutMs: 30_000,
    }),

  assignProducts: (id: string, productIds: string[]) =>
    request<{ data: { assigned_count: number } }>(`/v1/categories/${id}/products`, {
      method: 'POST',
      body: JSON.stringify({ product_ids: productIds }),
    }),
}
