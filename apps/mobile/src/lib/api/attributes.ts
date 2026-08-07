import { request } from './client'

// ─── Product Attributes (Style / Occasion / Fabric) ────────────────
// Same dynamic, DB-backed taxonomy as categories.ts (ProductCategory), one
// module covering all three kinds instead of three near-duplicate files.

export type ProductAttributeKind = 'STYLE' | 'OCCASION' | 'FABRIC'

export type ProductAttribute = {
  id: string
  kind: ProductAttributeKind
  name: string
  sort_order: number
}

export const productAttributeApi = {
  list: (kind: ProductAttributeKind) =>
    request<{ data: ProductAttribute[] }>(`/v1/product-attributes?kind=${kind}`, {
      getCacheTtlMs: 15_000,
    }),

  create: (kind: ProductAttributeKind, name: string) =>
    request<{ data: ProductAttribute }>('/v1/product-attributes', {
      method: 'POST',
      body: JSON.stringify({ kind, name }),
    }),

  delete: (id: string) => request<void>(`/v1/product-attributes/${id}`, { method: 'DELETE' }),
}
