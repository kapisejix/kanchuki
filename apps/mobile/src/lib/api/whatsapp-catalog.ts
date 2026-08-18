// Phase II: WhatsApp Native Catalog Sync — mobile API client.
// Backs the settings screen (F2–F6) and the per-product badges in the
// catalog tab (F7). All endpoints are gated by WHATSAPP_CATALOG_SYNC on the
// API side; GET /me/whatsapp-catalog returns { data: null } when the plan
// feature is off.

import { request } from './client'

export type CatalogSyncStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS'

export type WhatsAppCatalogStatus = {
  configured: boolean
  whatsapp_api_phone_number_id: string | null
  whatsapp_catalog_id: string | null
  sync_enabled: boolean
  sync_categories: string[]
  last_synced_at: string | null
  items_synced: number
  items_failed: number
  items_pending: number
}

export type WhatsAppCatalogLog = {
  id: string
  operation: string
  product_id: string | null
  meta_item_id: string | null
  status: CatalogSyncStatus
  error_message: string | null
  created_at: string
}

export type WhatsAppCatalogItem = {
  product_id: string
  product_name: string
  sku: string | null
  price_paise: number
  status: CatalogSyncStatus
  error_message: string | null
  whatsapp_catalog_item_id: string | null
  product_status: string
  hsn_code: string | null
  last_synced_at: string | null
}

export const whatsappCatalogApi = {
  /** D1 — status + counts. Returns data:null when the plan feature is off. */
  getStatus: () =>
    request<{ data: WhatsAppCatalogStatus | null }>('/v1/retailers/me/whatsapp-catalog', {
      getCacheTtlMs: 30_000,
    }),

  /** D2 — enable/disable sync + select categories. */
  updateSettings: (data: { sync_enabled?: boolean; sync_categories?: string[] }) =>
    request<{
      data: {
        sync_enabled: boolean
        sync_categories: string[]
        whatsapp_catalog_id: string | null
        last_synced_at: string | null
      }
    }>('/v1/retailers/me/whatsapp-catalog', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** D3 — manual full sync. Returns the BullMQ job id. */
  syncNow: () =>
    request<{ data: { job_id: string; operation: string; status: string } }>(
      '/v1/retailers/me/whatsapp-catalog/sync',
      { method: 'POST', timeoutMs: 20_000 },
    ),

  /** D4 — single-product sync (used by the F7 badge tap). */
  syncProduct: (productId: string) =>
    request<{ data: { job_id: string; product_id: string; status: string } }>(
      `/v1/retailers/me/whatsapp-catalog/sync/${productId}`,
      { method: 'POST', timeoutMs: 20_000 },
    ),

  /** D5 — sync history, newest first. */
  getLogs: () =>
    request<{ data: WhatsAppCatalogLog[] }>('/v1/retailers/me/whatsapp-catalog/logs', {
      getCacheTtlMs: 30_000,
    }),

  /** D6 — synced items with Meta ids + status (drives the F7 badges). */
  getItems: () =>
    request<{ data: WhatsAppCatalogItem[] }>('/v1/retailers/me/whatsapp-catalog/items', {
      getCacheTtlMs: 60_000,
    }),
}
