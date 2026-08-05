import { request } from './client'

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
