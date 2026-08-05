import { request } from './client'

// ─── F-019: Paid On-Site Catalog Upload Service ────────────────────

export type CatalogUploadTicket = {
  id: string
  status: 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED'
  ticket_type: 'GENERAL' | 'CATALOG_UPLOAD'
  item_count_requested: number | null
  quoted_price_inr: number | null
  proposed_slots: string[] | null
  confirmed_slot: string | null
  razorpay_order_id: string | null
  paid_at: string | null
  created_at: string
  resolved_at: string | null
}

export const catalogUploadApi = {
  list: () =>
    request<{ data: CatalogUploadTicket[] }>('/v1/retailers/me/catalog-upload-request', {
      getCacheTtlMs: 10_000,
    }),
  create: (data: { item_count_estimate: number; note?: string }) =>
    request<{ data: CatalogUploadTicket }>('/v1/retailers/me/catalog-upload-request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  pay: (ticketId: string) =>
    request<{ data: { checkout_url: string } }>(
      `/v1/retailers/me/catalog-upload-request/${ticketId}/pay`,
      { method: 'POST' },
    ),
  confirmSlot: (ticketId: string, slot: string) =>
    request<{ data: CatalogUploadTicket }>(
      `/v1/retailers/me/catalog-upload-request/${ticketId}/confirm-slot`,
      { method: 'POST', body: JSON.stringify({ slot }) },
    ),
}
