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

  getMeasurements: (id: string) =>
    request<{ data: unknown[] }>(`/v1/customers/${id}/measurements`, { getCacheTtlMs: 60_000 }),

  createManualMeasurement: (id: string, data: {
    height_cm: number
    bust_cm?: number
    waist_cm?: number
    hip_cm?: number
    pant_waist_cm?: number
    pant_hip_cm?: number
    inseam_cm?: number
  }) =>
    request<{ data: { id: string; source: string; height_cm: number; bust_cm: number | null; waist_cm: number | null; hip_cm: number | null } }>(
      `/v1/customers/${id}/measurements`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  initPhotoMeasurement: (id: string, heightCm: number, consentGiven: boolean) =>
    request<{
      data: {
        measurement_id: string
        front_upload_url: string
        back_upload_url: string
        expires_in: number
      }
    }>(`/v1/customers/${id}/measurements/photo-upload-url`, {
      method: 'POST',
      body: JSON.stringify({ height_cm: heightCm, consent_given: consentGiven }),
    }),

  extractMeasurement: (id: string, measurementId: string) =>
    request<{ data: { measurement_id: string; status: string } }>(
      `/v1/customers/${id}/measurements/${measurementId}/extract`,
      { method: 'POST' },
    ),

  // Phase 1 — AI-matched products based on Fashion DNA
  getMatches: (id: string, params?: { limit?: number; category?: string; price_max?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.category) qs.set('category', params.category)
    if (params?.price_max) qs.set('price_max', String(params.price_max))
    return request<{
      data: {
        products: Record<string, unknown>[]
        dna_used: boolean
        dna_confidence: number
      }
    }>(`/v1/customers/${id}/matches?${qs}`, { getCacheTtlMs: 60_000 })
  },
}
