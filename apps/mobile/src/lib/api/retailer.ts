import { request } from './client'

export const retailerApi = {
  getMe: () => request<{ data: unknown }>('/v1/retailers/me', { getCacheTtlMs: 60_000 }),
  getStats: () => request<{ data: unknown }>('/v1/retailers/me/stats', { getCacheTtlMs: 30_000 }),
  update: (data: Record<string, unknown>) =>
    request<{ data: unknown }>('/v1/retailers/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updateOnboarding: (step: number, completed?: boolean, extra?: { demo_plan?: boolean }) =>
    request<{ data: { onboarding_step: number; onboarding_completed: boolean } }>(
      '/v1/retailers/me/onboarding',
      { method: 'PATCH', body: JSON.stringify({ step, completed, ...extra }) },
    ),
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
  deleteQrSlug: () => request<void>('/v1/retailers/me/qr-slug', { method: 'DELETE' }),
  setStorefront: (collectionId: string | null) =>
    request<{ data: { storefront_collection_id: string | null } }>('/v1/retailers/me/storefront', {
      method: 'PATCH',
      body: JSON.stringify({ collection_id: collectionId }),
    }),

  /** F-009: Store banner upload */
  getBannerUploadUrl: (contentType: string, sizeBytes: number) =>
    request<{
      data: { upload_url: string; r2_key: string; public_url: string; expires_in: number }
    }>('/v1/retailers/me/banner-upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename: 'banner.jpg', content_type: contentType, size_bytes: sizeBytes }),
      timeoutMs: 30_000,
    }),

  /** F-009: Store logo upload */
  getLogoUploadUrl: (contentType: string, sizeBytes: number) =>
    request<{
      data: { upload_url: string; r2_key: string; public_url: string; expires_in: number }
    }>('/v1/retailers/me/logo-upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename: 'logo.jpg', content_type: contentType, size_bytes: sizeBytes }),
      timeoutMs: 30_000,
    }),

  /** F-009: KYC doc upload — gst | aadhar_front | aadhar_back */
  getKycUploadUrl: (docType: 'gst' | 'aadhar_front' | 'aadhar_back', contentType: string, sizeBytes: number) =>
    request<{
      data: { upload_url: string; r2_key: string; public_url: string; expires_in: number }
    }>('/v1/retailers/me/kyc-upload-url', {
      method: 'POST',
      body: JSON.stringify({
        doc_type: docType,
        filename: `${docType}.jpg`,
        content_type: contentType,
        size_bytes: sizeBytes,
      }),
      timeoutMs: 30_000,
    }),

  submitKycDoc: (docType: 'gst' | 'aadhar_front' | 'aadhar_back', r2Key: string, url: string) =>
    request<{ data: { kyc_status: string } }>('/v1/retailers/me/kyc', {
      method: 'PATCH',
      body: JSON.stringify({ doc_type: docType, r2_key: r2Key, url }),
    }),

  /** Meta WhatsApp Business API — bring-your-own credentials for bulk send */
  getWhatsAppApiConfig: () =>
    request<{
      data: {
        configured: boolean
        whatsapp_api_phone_number_id: string | null
        whatsapp_api_template_name: string | null
        whatsapp_api_template_lang: string | null
      }
    }>('/v1/retailers/me/whatsapp-api', { getCacheTtlMs: 30_000 }),

  saveWhatsAppApiConfig: (data: {
    phone_number_id: string
    access_token?: string
    template_name: string
    template_lang?: string
  }) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/whatsapp-api', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  disconnectWhatsAppApi: () => request<void>('/v1/retailers/me/whatsapp-api', { method: 'DELETE' }),

  /** Hard-delete the retailer account and all associated data */
  delete: () => request<void>('/v1/retailers/me', { method: 'DELETE' }),

  /** F-010: Get usage vs limits for all metered resources */
  getUsage: () =>
    request<{
      data: {
        resource_type: string
        limit: number
        used: number
        period: string
        source: 'plan' | 'override' | 'unlimited'
      }[]
    }>('/v1/retailers/me/usage', { getCacheTtlMs: 30_000 }),
}
