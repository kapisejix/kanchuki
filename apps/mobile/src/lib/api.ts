import { router } from 'expo-router'
import { File } from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'
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

// Single-flight refresh — concurrent 401s share one refresh call instead of
// each racing to burn the same refresh_token.
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getItem('refresh_token')
      if (!refreshToken) return null
      try {
        const res = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return null
        const { data } = (await res.json()) as {
          data: { access_token: string; refresh_token: string }
        }
        await setToken(data.access_token)
        await setItem('refresh_token', data.refresh_token)
        return data.access_token
      } catch {
        return null
      }
    })()
  }
  const token = await refreshPromise
  refreshPromise = null
  return token
}

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number; getCacheTtlMs?: number } = {},
  isRetry = false,
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
      throw new ApiError(
        'TIMEOUT',
        `Request timed out (${path}). Check that the API server is running at ${API_URL} and try again.`,
        408,
      )
    }
    // Handle errors from request-cache.ts (RequestError has .code/.status)
    const cacheErr = err as { code?: string; status?: number }
    const code = err instanceof ApiError ? err.code : cacheErr.code
    const status = err instanceof ApiError ? err.status : cacheErr.status

    // Expired access token — refresh once and retry the original request
    if (status === 401 && code === 'UNAUTHORIZED' && !isRetry) {
      const newToken = await refreshAccessToken()
      if (newToken) return request<T>(path, options, true)
      await clearToken()
      await deleteItem('refresh_token')
      clearRequestCache()
      router.replace('/auth/phone')
    }

    if (err instanceof ApiError) throw err
    if (code && status) {
      throw new ApiError(code, err instanceof Error ? err.message : 'Request failed', status)
    }
    // Re-wrap raw fetch errors as ApiError
    throw new ApiError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error', status ?? 0)
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
  /**
   * Send OTP via Supabase Auth.
   * Uses a longer timeout (30s) because Supabase's SMS provider (Twilio) can
   * take 10–25s to deliver, especially on first call to a new phone number.
   */
  sendOtp: (phone: string) =>
    request<{ data: { message: string; phone: string } }>('/v1/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      timeoutMs: 30_000,
    }),

  /**
   * Verify OTP and get session tokens.
   * Same 30s timeout — Supabase token exchange can be slow on cold start.
   */
  verifyOtp: (phone: string, otp: string) =>
    request<{
      data: {
        access_token: string
        refresh_token: string
        retailer: { id: string }
        is_new: boolean
      }
    }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
      timeoutMs: 30_000,
    }),
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
  createSection: (data: { name: string; type: string; parent_id?: string }) =>
    request<{ data: { id: string; name: string; type: string } }>('/v1/retailers/me/sections', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getQrSlug: () =>
    request<{ data: { public_slug: string; profile_url: string } }>('/v1/retailers/me/qr-slug', {
      method: 'POST',
    }),
  setStorefront: (collectionId: string | null) =>
    request<{ data: { storefront_collection_id: string | null } }>('/v1/retailers/me/storefront', {
      method: 'PATCH',
      body: JSON.stringify({ collection_id: collectionId }),
    }),

  /** F-009: Soft-delete the retailer account */
  delete: () => request<void>('/v1/retailers/me', { method: 'DELETE' }),

  /** F-010: Get usage vs limits for all metered resources */
  getUsage: () =>
    request<{
      data: Array<{
        resource_type: string
        limit: number
        used: number
        period: string
        source: 'plan' | 'override' | 'unlimited'
      }>
    }>('/v1/retailers/me/usage', { getCacheTtlMs: 30_000 }),
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
      timeoutMs: 30_000,
    }),

  create: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/products', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 30_000,
    }),

  list: (params?: { status?: string; category?: string; is_new_arrival?: boolean; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.category) qs.set('category', params.category)
    if (params?.is_new_arrival) qs.set('is_new_arrival', 'true')
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.limit) qs.set('limit', String(params.limit))
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/products?${qs}`, {
      getCacheTtlMs: 10_000,
    })
  },

  get: (id: string) =>
    // Short TTL — this screen polls while AI tagging is in progress, so a
    // long-lived cache would mask the update and leave the spinner stuck.
    request<{ data: unknown }>(`/v1/products/${id}`, { getCacheTtlMs: 3_000 }),

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

  bulkDelete: (ids: string[]) =>
    request<{ data: { deleted_count: number } }>('/v1/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  search: (query: string, filters?: Record<string, unknown>, limit = 12) =>
    request<{ data: unknown[]; query_interpretation: unknown }>('/v1/search', {
      method: 'POST',
      body: JSON.stringify({ query, filters, limit }),
      timeoutMs: 15_000, // AI search may take longer
    }),

  setPhotoPieceType: (productId: string, photoId: string, pieceType: 'upper' | 'lower' | null) =>
    request<{ data: unknown }>(`/v1/products/${productId}/photos/${photoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ piece_type: pieceType }),
    }),

  addPhoto: (
    productId: string,
    data: { r2_key: string; url: string; content_type: string; piece_type?: 'upper' | 'lower' },
  ) =>
    request<{ data: unknown }>(`/v1/products/${productId}/photos`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cleanupPhoto: (productId: string, photoId: string) =>
    request<{ data: { id: string; url: string } }>(
      `/v1/products/${productId}/photos/${photoId}/cleanup`,
      { method: 'POST', timeoutMs: 30_000 },
    ),

  addVariant: (productId: string, data: { color: string; r2_key: string; url: string }) =>
    request<{ data: unknown }>(`/v1/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteVariant: (productId: string, variantId: string) =>
    request<void>(`/v1/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),

  /** Quick color-only AI detect — pre-fills color field on "Add Color" screen */
  detectColor: (imageUrl: string) =>
    request<{ data: { color: string | null } }>('/v1/products/detect-color', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl }),
      timeoutMs: 15_000,
    }),
}

// ─── Upload helper (direct to R2) ─────────────────────────────────

// Reads a local/picker image URI into a Blob using expo-file-system.
// React Native's fetch() does NOT support file:// or content:// URIs, which
// is what ImagePicker returns. expo-file-system.File handles these natively.
//
// IMPORTANT: We return the File directly because React Native's Blob constructor
// does NOT support ArrayBuffer as a BlobPart. Attempting new Blob([arrayBuffer])
// throws: "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported".
// File implements the Blob interface so it works as the body of a PUT fetch().
export async function readLocalImage(uri: string, _timeoutMs = 15_000): Promise<Blob> {
  try {
    const file = new File(uri)
    if (!file.exists) {
      throw new Error('File does not exist at the specified path')
    }
    return file
  } catch (err) {
    throw new ApiError(
      'READ_FAILED',
      err instanceof Error ? err.message : 'Could not read the selected photo. Please try a different photo.',
      500,
    )
  }
}

// PUTs the local file straight through native upload machinery (NSURLSession /
// OkHttp), not RN's fetch(). expo-file-system's `File` only *implements* the
// Blob interface — it isn't a real `instanceof Blob` wired into RN's native
// Blob registry, so fetch(..., { body: file }) can resolve 200 while silently
// sending truncated/empty bytes. R2 still stores the declared Content-Type
// regardless of body validity, so the corruption only surfaces later as
// "cannot identify image file" when something tries to decode the object.
export async function uploadImageToR2(
  localUri: string,
  uploadUrl: string,
  contentType: string,
  timeoutMs = 30_000,
): Promise<void> {
  let result: LegacyFileSystem.FileSystemUploadResult
  try {
    result = await Promise.race([
      LegacyFileSystem.uploadAsync(uploadUrl, localUri, {
        httpMethod: 'PUT',
        uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new ApiError('TIMEOUT', 'Image upload timed out. Check your connection.', 408)),
          timeoutMs,
        ),
      ),
    ])
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(
      'UPLOAD_FAILED',
      err instanceof Error ? err.message : 'Image upload failed',
      500,
    )
  }

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError('UPLOAD_FAILED', 'Image upload failed', result.status)
  }
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
    consentToTraining?: boolean,
  ) =>
    request<{ data: { id: string; status: string } }>('/v1/try-on/initiate', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        customer_photo_r2_key: customerPhotoR2Key,
        ...(measurementId ? { measurement_id: measurementId } : {}),
        consent_to_training: !!consentToTraining,
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
        revocation_token: string | null
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
        products: Array<Record<string, unknown>>
        dna_used: boolean
        dna_confidence: number
      }
    }>(`/v1/customers/${id}/matches?${qs}`, { getCacheTtlMs: 60_000 })
  },
}

// ─── Staff / Team (F-009) ────────────────────────────────────────

export type StaffMember = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'manager' | 'salesperson'
  is_active: boolean
  created_at: string
}

export const staffApi = {
  list: () =>
    request<{ data: StaffMember[] }>('/v1/staff', { getCacheTtlMs: 15_000 }),

  create: (data: { name: string; phone: string; role?: string }) =>
    request<{ data: StaffMember }>('/v1/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; phone?: string; role?: string }) =>
    request<{ data: StaffMember }>(`/v1/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/staff/${id}`, { method: 'DELETE' }),
}

// ─── Size Charts ──────────────────────────────────────────────────

export type SizeChartCategory = 'UPPER' | 'LOWER'

export type SizeChartRow = {
  size_label: string
  sort_order: number
  bust_min_cm?: number
  bust_max_cm?: number
  waist_min_cm?: number
  waist_max_cm?: number
  hip_min_cm?: number
  hip_max_cm?: number
  length_min_cm?: number
  length_max_cm?: number
}

export const sizeChartApi = {
  list: () =>
    request<{ data: Array<{ id: string; category: SizeChartCategory; rows: SizeChartRow[] }> }>(
      '/v1/size-charts',
      { getCacheTtlMs: 30_000 },
    ),

  save: (category: SizeChartCategory, rows: SizeChartRow[]) =>
    request<{ data: unknown }>('/v1/size-charts', {
      method: 'PUT',
      body: JSON.stringify({ category, rows }),
    }),

  recommend: (customerId: string, category: SizeChartCategory) =>
    request<{ data: { size_label: string; row_id: string } }>(
      `/v1/size-charts/recommend?customer_id=${customerId}&category=${category}`,
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

  cancel: () =>
    request<{ data: { plan_status: string; cancelled_at: string } }>('/v1/billing/cancel', {
      method: 'POST',
    }),
}

// ─── Catalog Import (F-001b / F-001c) ────────────────────────────

export type CatalogDetectedItem = {
  description: string
  cropped_url: string
  cropped_r2_key: string
  page_number?: number
  phash: string
  is_duplicate: boolean
  duplicate_of_product_id: string | null
  tags: {
    category: string | null
    primary_color: string | null
    secondary_colors: string[]
    fabric_estimate: string | null
    pattern: string | null
    embellishments: string[]
    neck_style: string | null
    sleeve_type: string | null
    occasions: string[]
    price_range_estimate: string | null
    design_number_visible: string | null
    is_catalog_image: boolean
    search_tags: string[]
  }
}

export const catalogImportApi = {
  /**
   * Get a presigned upload URL for a catalog import source image or PDF.
   */
  getUploadUrl: (filename: string, contentType: string, sizeBytes: number) =>
    request<{
      data: {
        upload_url: string
        r2_key: string
        public_url: string
        expires_in: number
      }
    }>('/v1/catalog-import/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, size_bytes: sizeBytes }),
      timeoutMs: 30_000,
    }),

  /**
   * F-001c: Detect multiple garments in a single catalog/product photo.
   * Upload the source image first via getUploadUrl, then pass the public_url.
   */
  detectItems: (imageUrl: string) =>
    request<{
      data: {
        source_type: 'image'
        total_items: number
        items: CatalogDetectedItem[]
      }
    }>('/v1/catalog-import/detect-items', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl }),
      timeoutMs: 60_000, // Claude Vision + cropping + re-tagging takes time
    }),

  /**
   * F-001b: Import a PDF catalog. If page_images[] is provided, runs
   * multi-item detection on each page. If not, returns PDF metadata.
   */
  importPdf: (pdfUrl: string, pageImages?: string[]) =>
    request<{
      data: {
        source_type: 'pdf'
        total_items: number
        total_pages: number
        page_dimensions?: Array<{ width: number; height: number }>
        items: CatalogDetectedItem[]
        render_required?: boolean
        max_page_images?: number
      }
    }>('/v1/catalog-import/import-pdf', {
      method: 'POST',
      body: JSON.stringify({
        pdf_url: pdfUrl,
        ...(pageImages ? { page_images: pageImages } : {}),
      }),
      timeoutMs: 180_000, // PDF processing + detection can be slow
    }),

  /**
   * Save reviewed items as real products in one batch.
   */
  bulkCreateProducts: (
    items: Array<{
      cropped_r2_key: string
      cropped_url: string
      category?: string | null
      primary_color?: string | null
      fabric_estimate?: string | null
      pattern?: string | null
      occasions?: string[]
      search_tags?: string[]
      price_min?: number | null
      price_max?: number | null
      section_id?: string | null
      phash?: string | null
    }>,
    default_section_id?: string | null,
  ) =>
    request<{
      data: {
        total_requested: number
        total_created: number
        products: Array<{ id: string; cropped_url: string }>
      }
    }>('/v1/catalog-import/bulk-create-products', {
      method: 'POST',
      body: JSON.stringify({ items, default_section_id }),
      timeoutMs: 60_000,
    }),
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
}
