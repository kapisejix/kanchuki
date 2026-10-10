import * as LegacyFileSystem from 'expo-file-system/legacy';
import type {
  ProductDetail,
  ProductSummary,
  CreateProductInput,
  UpdateProductInput,
  Pagination,
  ProductStatus,
} from '@kanchuki/shared';
import { compressImageForUpload } from '../compress-image';
import { API_URL, ApiError, getToken, request } from './client';

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

  /** Admin-curated AI Studio Shoot styles this retailer's plan can use.
   * Cached 60s — the picker falls back to the last response offline. */
  getStudioStyles: (productId?: string) =>
    request<{
      data: {
        slug: string;
        label: string;
        description: string;
        tab: 'PRODUCT' | 'MODEL';
        audience: string[];
        thumbnail_url: string | null;
      }[];
      // Present on a current API; with `productId` the list is already narrowed
      // to the styles that product may use.
      meta?: { model_available: boolean; model_unavailable_reason: string | null };
    }>(
      productId
        ? `/v1/products/studio-styles?product_id=${encodeURIComponent(productId)}`
        : '/v1/products/studio-styles',
      { getCacheTtlMs: 60_000 },
    ),

  addVariant: (productId: string, data: { color: string; r2_key: string; url: string }) =>
    request<{ data: unknown }>(`/v1/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteVariant: (productId: string, variantId: string) =>
    request<void>(`/v1/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),

  /** Retailer-triggered re-run of AI tagging — fills blank name/subtype/
   * SKU/description and refreshes category/color/fabric/pattern. */
  retag: (id: string) =>
    request<{ data: { retag_queued: boolean } }>(`/v1/products/${id}/retag`, {
      method: 'POST',
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

  // ─── F-040: in-store virtual try-on ──────────────────────
  /**
   * Start a try-on for a walk-in customer. The customer's photo goes up as a
   * multipart part named `photo` — the same name the API reads with
   * `request.file()` — and the accepted consent version rides in the QUERY
   * STRING, not a form field, because @fastify/multipart only guarantees a
   * field it has already parsed: a field ordered after the file can read as
   * absent and the server (correctly) refuses an unconsented request.
   *
   * `consentVersion` is required — callers pass `TRY_ON_CONSENT.version` from
   * `@kanchuki/shared` after the person taps accept. The server compares it to
   * the current notice version and 422s a stale or missing one.
   *
   * Compressed to ≤80KB first (JPEG, quality-first — see compress-image.ts) so
   * a phone photo never approaches the API's 10MB multipart cap.
   */
  startTryOn: async (
    productId: string,
    consentVersion: string,
    photoUri: string,
  ): Promise<{ data: { job_id: string; status: string } }> => {
    const token = await getToken();
    let uri = photoUri;
    try {
      uri = await compressImageForUpload(photoUri);
    } catch (err) {
      // Never block the generation on compression — the original still fits.
      console.warn('Try-on photo compression failed — uploading original:', err);
    }

    const url = `${API_URL}/v1/products/${productId}/try-on?consent_version=${encodeURIComponent(
      consentVersion,
    )}`;
    const result = await LegacyFileSystem.uploadAsync(url, uri, {
      httpMethod: 'POST',
      uploadType: LegacyFileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'photo',
      mimeType: 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const body = safeJson(result.body);
    if (result.status >= 400) {
      const envelope = body as { error?: { code?: string; message?: string } } | null;
      throw new ApiError(
        envelope?.error?.code ?? 'TRY_ON_FAILED',
        envelope?.error?.message ?? 'Could not start the try-on. Please try again.',
        result.status,
      );
    }
    return body as { data: { job_id: string; status: string } };
  },

  /**
   * Poll a try-on job. `processing` while the RunPod generation runs;
   * `ready` carries a short-lived presigned URL for the generated image;
   * `failed` carries a safe message; `withdrawn` means the shopper took their
   * consent back and the stored image was deleted — a terminal state the UI
   * must handle, not keep polling through.
   */
  getTryOnStatus: (productId: string, jobId: string) =>
    request<{
      data: {
        status: 'processing' | 'ready' | 'failed' | 'withdrawn';
        url?: string | null;
        error?: string;
      };
    }>(`/v1/products/${productId}/try-on/status?job_id=${encodeURIComponent(jobId)}`, {
      getCacheTtlMs: 0,
      timeoutMs: 15_000,
    }),
};

/** Best-effort JSON parse of an uploadAsync body — it is a plain string, and a
 *  non-JSON error page must not surface as an unhandled parse throw. */
function safeJson(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
