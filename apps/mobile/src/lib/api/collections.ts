import { request } from './client'

export type EnquiryStatus = 'NEW' | 'SEEN' | 'REPLIED' | 'CLOSED'
export type Assignee = { id: string; name: string }
// F-044 E3 inbox row. customer_phone is masked server-side for staff.
export type Enquiry = {
  id: string
  collection_id: string
  customer_name: string | null
  customer_phone: string | null
  message: string | null
  status: EnquiryStatus
  created_at: string
  collection: { id: string; title: string }
  products: { id: string; name: string | null; photo_url: string | null }[]
  assigned_to: Assignee | null
}

export const collectionApi = {
  enquiries: () =>
    request<{ data: Enquiry[]; assignees?: Assignee[] }>('/v1/collections/enquiries'),

  // No GET cache: the badge must drop as soon as the inbox marks one SEEN.
  unreadEnquiries: () =>
    request<{ data: { count: number } }>('/v1/collections/enquiries/unread-count', {
      getCacheTtlMs: 0,
    }),

  takeEnquiry: (id: string) =>
    request<{ data: { id: string; assigned_to: Assignee } }>(
      `/v1/collections/enquiries/${id}/take`,
      { method: 'POST' },
    ),

  assignEnquiry: (id: string, staffId: string) =>
    request<{ data: { id: string; assigned_to: Assignee } }>(
      `/v1/collections/enquiries/${id}/assign`,
      { method: 'PATCH', body: JSON.stringify({ staff_id: staffId }) },
    ),

  setEnquiryStatus: (collectionId: string, id: string, status: EnquiryStatus) =>
    request<{ data: unknown }>(`/v1/collections/${collectionId}/enquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  list: () =>
    request<{ data: unknown[] }>('/v1/collections', { getCacheTtlMs: 15_000 }),

  create: (data: Record<string, unknown>) =>
    request<{ data: { slug: string; url: string } & Record<string, unknown> }>(
      '/v1/collections',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  get: (id: string) =>
    request<{ data: unknown }>(`/v1/collections/${id}`, { getCacheTtlMs: 30_000 }),

  update: (id: string, data: { title?: string; expires_days?: number }) =>
    request<{ data: Record<string, unknown> }>(`/v1/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/collections/${id}`, { method: 'DELETE' }),

  // Phase 1 — AI auto-suggest collection for a customer
  autoSuggest: (customerId: string, title?: string) =>
    request<{ data: Record<string, unknown> }>('/v1/collections/auto-suggest', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId, title, limit: 12 }),
      timeoutMs: 15_000,
    }),

  /** Bulk-send via retailer's configured WhatsApp Business API */
  bulkSend: (id: string, customerIds: string[]) =>
    request<{
      data: { sent: number; failed_count: number; failed: { customer_id: string; error: string }[] }
    }>(`/v1/collections/${id}/bulk-send`, {
      method: 'POST',
      body: JSON.stringify({ customer_ids: customerIds }),
      timeoutMs: 30_000,
    }),
}
