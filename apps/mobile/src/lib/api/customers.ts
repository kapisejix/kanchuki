import { request } from './client'

export const customerApi = {
  list: (search?: string, cursor?: string) => {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (cursor) qs.set('cursor', cursor)
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/customers?${qs}`, {
      getCacheTtlMs: 15_000,
    })
  },

  get: (id: string) =>
    request<{ data: unknown }>(`/v1/customers/${id}`, { getCacheTtlMs: 30_000 }),

  create: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ data: unknown }>(`/v1/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/customers/${id}`, { method: 'DELETE' }),
}
