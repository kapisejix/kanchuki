import { request } from './client'

export const collectionApi = {
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
