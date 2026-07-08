import { getItem, setItem, deleteItem } from './storage'
import { cachedJsonRequest, clearRequestCache } from './request-cache'

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export function getToken(): Promise<string | null> {
  return getItem('auth_token')
}

export function setToken(token: string): Promise<void> {
  return setItem('auth_token', token)
}

export function clearToken(): Promise<void> {
  return deleteItem('auth_token')
}

export { clearRequestCache }

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
  options: RequestInit & { timeoutMs?: number; getCacheTtlMs?: number } = {},
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const method = (options.method ?? 'GET').toUpperCase()

  try {
    const data = await cachedJsonRequest<T>(`${API_URL}${path}`, {
      ...options,
      headers,
      timeoutMs: options.timeoutMs ?? 10_000,
      // Cache GET responses for 15s by default — stale-while-revalidate
      // pattern via react-query handles the rest
      getCacheTtlMs: method === 'GET' ? (options.getCacheTtlMs ?? 15_000) : 0,
    })
    return data
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Request timed out. Check your connection.', 408)
    }
    if (err instanceof ApiError) throw err
    // Handle errors from request-cache.ts (RequestError has .code/.status)
    const cacheErr = err as { code?: string; status?: number }
    if (cacheErr.code && cacheErr.status) {
      throw new ApiError(cacheErr.code, err instanceof Error ? err.message : 'Request failed', cacheErr.status)
    }
    // Re-wrap raw fetch errors as ApiError
    const status = cacheErr.status ?? 0
    throw new ApiError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error', status)
  }
}

// ─── Analytics ───────────────────────────────────────────────────

export const analyticsApi = {
  getAnalytics: () =>
    request<{
      data: {
        daily_trends: { date: string; views: number; enquiries: number }[]
        category_breakdown: { category: string; count: number }[]
        status_breakdown: { status: string; count: number }[]
        recent_collections: {
          id: string
          title: string
          slug: string
          status: string
          view_count: number
          enquiry_count: number
          favorite_count: number
          product_count: number
          created_at: string
        }[]
        plan: {
          plan: string
          plan_status: string
          max_products: number
          max_customers: number
          try_on_credits: number
        } | null
      }
    }>('/v1/retailers/me/analytics', { getCacheTtlMs: 60_000 }),
}

// ─── Auth ─────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) =>
    request<{ message: string }>('/v1/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, otp: string) =>
    request<{ access_token: string; refresh_token: string; retailer_id: string; is_new: boolean }>(
      '/v1/auth/otp/verify',
      {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      },
    ),
}

// ─── Retailer ─────────────────────────────────────────────────────

export const retailerApi = {
  getMe: () => request<{ data: unknown }>('/v1/retailers/me', { getCacheTtlMs: 60_000 }),
  getStats: () => request<{ data: unknown }>('/v1/retailers/me/stats', { getCacheTtlMs: 30_000 }),
  update: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/retailers/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getSections: () => request<{ data: unknown[] }>('/v1/retailers/me/sections', { getCacheTtlMs: 120_000 }),
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
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/products?${qs}`, {
      getCacheTtlMs: 10_000,
    })
  },

  get: (id: string) =>
    request<{ data: unknown }>(`/v1/products/${id}`, { getCacheTtlMs: 30_000 }),

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

  delete: (id: string) => request<void>(`/v1/products/${id}`, { method: 'DELETE' }),

  search: (query: string, filters?: Record<string, unknown>, limit = 12) =>
    request<{ data: unknown[]; query_interpretation: unknown }>('/v1/search', {
      method: 'POST',
      body: JSON.stringify({ query, filters, limit }),
      timeoutMs: 15_000, // AI search may take longer
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

// ─── Try-On ──────────────────────────────────────────────────────

export const tryOnApi = {
  getUploadUrl: (contentType: string, sizeBytes: number) =>
    request<{
      data: {
        upload_url: string
        r2_key: string
        public_url: string
        job_id: string
        expires_in: number
      }
    }>('/v1/try-on/upload-url', {
      method: 'POST',
      body: JSON.stringify({ content_type: contentType, size_bytes: sizeBytes }),
    }),

  initiate: (
    productId: string,
    customerPhotoR2Key: string,
    measurementId?: string,
  ) =>
    request<{ data: { id: string; status: string } }>('/v1/try-on/initiate', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        customer_photo_r2_key: customerPhotoR2Key,
        ...(measurementId ? { measurement_id: measurementId } : {}),
      }),
    }),

  getJob: (id: string) =>
    request<{
      data: {
        id: string
        product_id: string
        status: string
        result_url: string | null
        error_message: string | null
        created_at: string
        started_at: string | null
        completed_at: string | null
      }
    }>(`/v1/try-on/jobs/${id}`, { getCacheTtlMs: 3000 }),

  listJobs: (cursor?: string) => {
    const qs = cursor ? `?cursor=${cursor}` : ''
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/try-on/jobs${qs}`, {
      getCacheTtlMs: 10_000,
    })
  },
}

// ─── Customers ────────────────────────────────────────────────────

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

// ─── Billing ──────────────────────────────────────────────────────

export const billingApi = {
  getPlans: () =>
    request<{
      data: {
        plan: string
        pricing: { monthly: number; annual: number }
        limits: {
          max_products: number | null
          max_customers: number | null
          try_on_credits: number
        }
      }[]
    }>('/v1/billing/plans', { getCacheTtlMs: 300_000 }), // plans rarely change

  getSubscription: () =>
    request<{
      data: {
        plan: string
        plan_status: string
        trial_ends_at: string | null
        plan_expires_at: string | null
        subscription: unknown
      }
    }>('/v1/billing/subscription', { getCacheTtlMs: 30_000 }),

  subscribe: (plan: string, billingPeriod: 'monthly' | 'annual') =>
    request<{ data: { razorpay_subscription_id: string; checkout_url: string } }>(
      '/v1/billing/subscription',
      {
        method: 'POST',
        body: JSON.stringify({ plan, billing_period: billingPeriod }),
      },
    ),
}

// ─── Collections ──────────────────────────────────────────────────

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
}
