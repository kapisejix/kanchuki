import type {
  ProductDetail,
  ProductSummary,
  CreateProductInput,
  UpdateProductInput,
  Pagination,
  ProductStatus,
} from '@kanchuki/shared';
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

  create: (data: CreateProductInput | Record<string, unknown>) =>
    request<{ data: ProductDetail }>('/v1/products', {
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
    return request<{ data: ProductSummary[]; pagination: Pagination }>(`/v1/products?${qs}`, {
      getCacheTtlMs: 10_000,
    });
  },

  get: (id: string) =>
    // Short TTL — this screen polls while AI tagging is in progress, so a
    // long-lived cache would mask the update and leave the spinner stuck.
    request<{ data: ProductDetail }>(`/v1/products/${id}`, { getCacheTtlMs: 3_000 }),

  update: (id: string, data: UpdateProductInput | Record<string, unknown>) =>
    request<{ data: ProductDetail }>(`/v1/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, status: ProductStatus | string) =>
    request<{ data: ProductDetail }>(`/v1/products/${id}/status`, {
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
  listDeleted: () => request<{ data: ProductSummary[] }>('/v1/products/deleted', { getCacheTtlMs: 0 }),

  /** Owner-only — undo a soft delete (staff or owner) */
  restore: (id: string) =>
    request<{ data: ProductDetail }>(`/v1/products/${id}/restore`, { method: 'PATCH' }),

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

  /** F-029: promote this photo to the product's main image — the catalog and
   * customer surfaces all order by is_primary desc, so this is what makes the
   * edited photo the image shown on the catalog and storefront. */
  setPhotoPrimary: (productId: string, photoId: string) =>
    request<{ data: { id: string; is_primary: boolean } }>(
      `/v1/products/${productId}/photos/${photoId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ is_primary: true }),
      },
    ),

  addPhoto: (
    productId: string,
    data: { r2_key: string; url: string; content_type: string; piece_type?: 'upper' | 'lower' },
  ) =>
    request<{ data: unknown }>(`/v1/products/${productId}/photos`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deletePhoto: (productId: string, photoId: string) =>
    request<{ data: { success: boolean; deleted_id: string } }>(
      `/v1/products/${productId}/photos/${photoId}`,
      {
        method: 'DELETE',
      },
    ),

  /** Remove background on a specific photo (optionally compositing it onto an
   * admin-curated backdrop — the edit screen's background picker targets the
   * currently-viewed photo, not just the product's primary).
   * F-030: addShadow is a per-call override of the product-level shadow
   * setting — wins for THIS cleanup only, never persisted (the toggle chip
   * on the edit screen behaves like the background swatches: bake-and-forget). */
  cleanupPhoto: (
    productId: string,
    photoId: string,
    backgroundImageId?: string | null,
    addShadow?: boolean,
  ) =>
    request<{ data: { id: string; url: string } }>(
      `/v1/products/${productId}/photos/${photoId}/cleanup`,
      {
        method: 'POST',
        body: JSON.stringify({
          background_image_id: backgroundImageId ?? null,
          ...(addShadow !== undefined ? { add_shadow: addShadow } : {}),
        }),
        timeoutMs: 30_000,
      },
    ),

  // F-011: admin-curated background library for the crop/cleanup picker.
  getBackgroundImages: () =>
    request<{
      data: { id: string; name: string; image_url: string; thumbnail_url: string | null }[];
    }>('/v1/products/background-images', { getCacheTtlMs: 60_000 }),

  /** Admin-curated AI Studio Shoot styles this retailer's plan can use.
   * Cached 60s — the picker falls back to the last response offline. */
  getStudioStyles: () =>
    request<{
      data: {
        slug: string;
        label: string;
        description: string;
        tab: 'PRODUCT' | 'MODEL';
        audience: string[];
        thumbnail_url: string | null;
      }[];
    }>('/v1/products/studio-styles', { getCacheTtlMs: 60_000 }),

  setBackground: (productId: string, backgroundImageId: string | null) =>
    request<{ data: { background_image_id: string | null; photo_url: string | null } }>(
      `/v1/products/${productId}/background`,
      {
        method: 'PATCH',
        body: JSON.stringify({ background_image_id: backgroundImageId }),
        timeoutMs: 30_000,
      },
    ),

  /** Rotate a saved photo 90° clockwise server-side — either the current
   * primary (target 'primary', default) or the preserved pre-cleanup
   * original (target 'original'). Mirrors cleanupPhoto's POST+timeout shape. */
  rotatePhoto: (productId: string, photoId: string, target: 'primary' | 'original' = 'primary') =>
    request<{
      data: { id: string; target: 'primary' | 'original'; url: string; width?: number; height?: number };
    }>(`/v1/products/${productId}/photos/${photoId}/rotate`, {
      method: 'POST',
      body: JSON.stringify({ target }),
      timeoutMs: 30_000,
    }),

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
   * SKU/description and refreshes category/color/fabric/pattern. */
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

  // ─── F-032: AI Studio Shoots (FLUX Kontext, async job) ─────────────
  /** Enqueue a studio-shoot generation for a photo. Returns 202 immediately
   * with a job_id — poll getStudioShootStatus until ready/failed. */
  startStudioShoot: (
    productId: string,
    photoId: string,
    template: string,
  ) =>
    request<{ data: { job_id: string; status: string } }>(
      `/v1/products/${productId}/photos/${photoId}/studio-shoot`,
      {
        method: 'POST',
        body: JSON.stringify({ template }),
        timeoutMs: 15_000,
      },
    ),

  /** Poll a studio-shoot job. 'processing' while the 10–60s generation runs;
   * 'ready' returns the new photo id + url; 'failed' returns a safe error.
   * Progress (0–100) and ETA (ms) are included while processing. */
  getStudioShootStatus: (productId: string, photoId: string, jobId: string) =>
    request<{
      data: {
        status: 'processing' | 'ready' | 'failed';
        photo_id?: string;
        url?: string;
        error?: string;
        progress?: number;
        etaMs?: number;
      };
    }>(`/v1/products/${productId}/photos/${photoId}/studio-shoot/status?job_id=${jobId}`, {
      getCacheTtlMs: 0,
      timeoutMs: 15_000,
    }),

  /** Fetch AI Studio quota credits left for the current retailer. */
  getStudioShootQuota: (productId: string, photoId: string) =>
    request<{
      data: {
        plan: string;
        used: number;
        limit: number;
        remaining: number;
        period: string;
        unlimited: boolean;
      };
    }>(`/v1/products/${productId}/photos/${photoId}/studio-shoot/quota`, {
      getCacheTtlMs: 30_000,
      timeoutMs: 10_000,
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
