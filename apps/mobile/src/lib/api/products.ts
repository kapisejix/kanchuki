import { request } from './client';

export const productApi = {
  getUploadUrl: (filename: string, contentType: string, sizeBytes: number) =>
    request<{
      data: {
        upload_url: string;
        r2_key: string;
        public_url: string;
        product_id: string;
        expires_in: number;
      };
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

  list: (params?: {
    status?: string;
    category?: string;
    category_id?: string;
    is_new_arrival?: boolean;
    sku?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.category_id) qs.set('category_id', params.category_id);
    if (params?.is_new_arrival) qs.set('is_new_arrival', 'true');
    if (params?.sku) qs.set('sku', params.sku);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ data: unknown[]; pagination: unknown }>(`/v1/products?${qs}`, {
      getCacheTtlMs: 10_000,
    });
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

  /** Owner-only "Recently Deleted" tab — see products.ts GET /deleted */
  listDeleted: () => request<{ data: unknown[] }>('/v1/products/deleted', { getCacheTtlMs: 0 }),

  /** Owner-only — undo a soft delete (staff or owner) */
  restore: (id: string) =>
    request<{ data: unknown }>(`/v1/products/${id}/restore`, { method: 'PATCH' }),

  /** Owner-only — permanent removal; fails with a clear message if the
   * product is referenced by a past order or collection. */
  purge: (id: string) => request<void>(`/v1/products/${id}/purge`, { method: 'DELETE' }),

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

  // F-011: admin-curated background library for the crop/cleanup picker.
  getBackgroundImages: () =>
    request<{
      data: { id: string; name: string; image_url: string; thumbnail_url: string | null }[];
    }>('/v1/products/background-images', { getCacheTtlMs: 60_000 }),

  setBackground: (productId: string, backgroundImageId: string | null) =>
    request<{ data: { background_image_id: string | null; photo_url: string | null } }>(
      `/v1/products/${productId}/background`,
      {
        method: 'PATCH',
        body: JSON.stringify({ background_image_id: backgroundImageId }),
        timeoutMs: 30_000,
      },
    ),

  addVariant: (productId: string, data: { color: string; r2_key: string; url: string }) =>
    request<{ data: unknown }>(`/v1/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteVariant: (productId: string, variantId: string) =>
    request<void>(`/v1/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),

  getSpinVideoUploadUrl: (productId: string, contentType: string, sizeBytes: number) =>
    request<{ data: { upload_url: string; r2_key: string; expires_in: number } }>(
      `/v1/products/${productId}/spin-video/upload-url`,
      {
        method: 'POST',
        body: JSON.stringify({ content_type: contentType, size_bytes: sizeBytes }),
        timeoutMs: 30_000,
      },
    ),

  submitSpinVideo: (productId: string, r2Key: string) =>
    request<{ data: { spin_status: string } }>(`/v1/products/${productId}/spin-video`, {
      method: 'POST',
      body: JSON.stringify({ r2_key: r2Key }),
    }),

  /** Retailer-triggered re-run of AI tagging — fills blank name/subtype/
   * SKU/description and refreshes category/color/fabric/pattern/occasions. */
  retag: (id: string) =>
    request<{ data: { retag_queued: boolean } }>(`/v1/products/${id}/retag`, {
      method: 'POST',
    }),

  /** Quick color-only AI detect — pre-fills color field on "Add Color" screen */
  detectColor: (imageUrl: string) =>
    request<{ data: { color: string | null } }>('/v1/products/detect-color', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl }),
      timeoutMs: 15_000,
    }),

  /**
   * Professional photo pipeline (product-add multi-shot capture flow):
   * cleans each raw kept shot server-side — background removal + backdrop
   * composite, optional SAM2 hanger/mannequin removal (best-effort, ₹0),
   * optional garment tight-crop — and returns the cleaned copies with the
   * sharpest one flagged primary. Long timeout: SAM2 on CPU takes seconds-to-
   * a-minute per photo.
   */
  proCleanup: (payload: {
    photos: {
      r2_key: string;
      url: string;
      // Tap-to-fix: normalized (0..1) points the retailer tapped on leftover
      // hanger/mannequin hardware (SAM2 point prompts) + optional garment
      // protect points. Omit for auto (remove_hardware) scanning.
      hardware_points?: [number, number][];
      garment_points?: [number, number][];
    }[];
    remove_hardware?: boolean;
    tight_crop?: boolean;
    background_image_id?: string | null;
  }) =>
    request<{
      data: {
        photos: {
          r2_key: string;
          url: string;
          score: number;
          is_primary: boolean;
          hardware_removed: boolean;
          hardware_skipped: boolean;
          tap_removed: boolean;
          error: string | null;
        }[];
        primary_url: string | null;
      };
    }>('/v1/products/pro-cleanup', {
      method: 'POST',
      body: JSON.stringify(payload),
      // 10 min: SAM2 hardware removal on CPU is seconds-to-a-minute per
      // photo; the whole batch runs serially server-side. The processing
      // screen tells the retailer to keep it open.
      timeoutMs: 600_000,
    }),

  /** Availability probe for the Pro capture flow — the Add Product screen
   * shows the Pro chip disabled up-front when the cleanup environment
   * (sidecar / local python) is down, instead of letting the retailer shoot
   * 3-5 photos and only fail at Process. Short client-side cache; pass
   * { refresh: true } to bypass (chip re-check after the sidecar comes up). */
  getProCleanupStatus: (opts?: { refresh?: boolean }) =>
    request<{
      data: {
        available: boolean;
        mode: 'service' | 'local';
        service_url_set: boolean;
        service_healthy: boolean | null;
        local_python_available: boolean;
      };
    }>('/v1/products/pro-cleanup/status', {
      getCacheTtlMs: opts?.refresh ? 0 : 30_000,
    }),
};
