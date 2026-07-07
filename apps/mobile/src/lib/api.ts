import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()
const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

function getToken(): string | null {
  return storage.getString('auth_token') ?? null
}

export function setToken(token: string): void {
  storage.set('auth_token', token)
}

export function clearToken(): void {
  storage.delete('auth_token')
}

class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Request failed',
      response.status,
    )
  }

  return response.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) =>
    request<{ message: string }>('/v1/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, otp: string) =>
    request<{ access_token: string; refresh_token: string; retailer_id: string; is_new: boolean }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),
}

// ─── Retailer ─────────────────────────────────────────────────────

export const retailerApi = {
  getMe: () => request<{ data: unknown }>('/v1/retailers/me'),
  getStats: () => request<{ data: unknown }>('/v1/retailers/me/stats'),
  update: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/retailers/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getSections: () => request<{ data: unknown[] }>('/v1/retailers/me/sections'),
}

// ─── Products ─────────────────────────────────────────────────────

export const productApi = {
  getUploadUrl: (filename: string, contentType: string, sizeBytes: number) =>
    request<{
      data: {
        upload_url: string
        r2_key: string
        public_url: string
        product_id: string
        expires_in: number
      }
    }>('/v1/products/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, size_bytes: sizeBytes }),
    }),

  create: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (params?: { status?: string; category?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.category) qs.set('category', params.category)
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.limit) qs.set('limit', String(params.limit))
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/products?${qs}`)
  },

  get: (id: string) => request<{ data: unknown }>(`/v1/products/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ data: unknown }>(`/v1/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, status: string) =>
    request<{ data: unknown }>(`/v1/products/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  delete: (id: string) =>
    request<void>(`/v1/products/${id}`, { method: 'DELETE' }),

  search: (query: string, filters?: Record<string, unknown>, limit = 12) =>
    request<{ data: unknown[]; query_interpretation: unknown }>('/v1/search', {
      method: 'POST',
      body: JSON.stringify({ query, filters, limit }),
    }),

  addVariant: (productId: string, data: { color: string; r2_key: string; url: string }) =>
    request<{ data: unknown }>(`/v1/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteVariant: (productId: string, variantId: string) =>
    request<void>(`/v1/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
}

// ─── Upload helper (direct to R2) ─────────────────────────────────

export async function uploadImageToR2(
  localUri: string,
  uploadUrl: string,
  contentType: string,
): Promise<void> {
  const response = await fetch(localUri)
  const blob = await response.blob()

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  })

  if (!upload.ok) throw new ApiError('UPLOAD_FAILED', 'Image upload failed', upload.status)
}

// ─── Customers ────────────────────────────────────────────────────

export const customerApi = {
  list: (search?: string, cursor?: string) => {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (cursor) qs.set('cursor', cursor)
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/customers?${qs}`)
  },

  get: (id: string) => request<{ data: unknown }>(`/v1/customers/${id}`),

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

  getMeasurements: (id: string) => request<{ data: unknown[] }>(`/v1/customers/${id}/measurements`),

  initPhotoMeasurement: (id: string, heightCm: number) =>
    request<{
      data: {
        measurement_id: string
        front_upload_url: string
        back_upload_url: string
        expires_in: number
      }
    }>(`/v1/customers/${id}/measurements/photo-upload-url`, {
      method: 'POST',
      body: JSON.stringify({ height_cm: heightCm }),
    }),

  extractMeasurement: (id: string, measurementId: string) =>
    request<{ data: { measurement_id: string; status: string } }>(
      `/v1/customers/${id}/measurements/${measurementId}/extract`,
      { method: 'POST' },
    ),
}

// ─── Collections ──────────────────────────────────────────────────

export const collectionApi = {
  list: () => request<{ data: unknown[] }>('/v1/collections'),

  create: (data: Record<string, unknown>) =>
    request<{ data: { slug: string; url: string } & Record<string, unknown> }>(
      '/v1/collections',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  get: (id: string) => request<{ data: unknown }>(`/v1/collections/${id}`),
}
