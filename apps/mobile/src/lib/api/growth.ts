import { request } from './client'

// ─── India Retailer Growth Engine (docs/INDIA-RETAILER-GROWTH.md) ──
// All module endpoints: campaigns/festivals (D/G/R/S), referrals (C),
// promotions (F), suppliers (K), bookings (L), inventory (J), videos
// (Q), translate (M).

export type CampaignType = 'FESTIVAL' | 'REACTIVATION' | 'PROMOTION' | 'AB_TEST'
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT'
export type CustomerLeadSource = 'MANUAL' | 'QR_SCAN' | 'STORE_SCAN' | 'REFERRAL' | 'CAMPAIGN'

// Numeric auto-increment id — admins manage the calendar (add/edit/delete),
// so ids carry no semantic meaning.
export type Festival = {
  id: number
  name: string
  region: string
  starts_at: string
  ends_at: string
}

/** Declarative customer filter stored on Campaign.audience_json. */
export type AudienceSpec = {
  /** Send to every consented customer (ignores other filters). */
  all?: boolean
  /** Explicit customer id list — not surfaced in the v1 UI (customer multi-select). */
  customer_ids?: string[]
  /** Preference-tag filters — customers who listed any of these. */
  colors?: string[]
  styles?: string[]
  fabrics?: string[]
  /** Behavioural filters. */
  min_total_spent_paise?: number
  max_budget_paise?: number
  /** Reactivation: no interaction in the last N days. */
  inactive_days?: number
  never_purchased?: boolean
  /** Lead-origin filter — e.g. only QR-captured leads. */
  sources?: CustomerLeadSource[]
}

export type AbVariant = {
  label: string
  message_template: string
  send_pct: number
}

export type CampaignSummary = {
  id: string
  type: CampaignType
  status: CampaignStatus
  name: string
  festival_name: string | null
  sent_count: number
  opened_count: number
  schedule_at: string | null
  sent_at: string | null
}

export type CampaignDetail = CampaignSummary & {
  message_template: string
  audience_json: AudienceSpec
  product_ids: string[]
  festival_id: number | null
  ab_variants: AbVariant[] | null
  sends_breakdown: Record<string, number>
}

export type CampaignStats = {
  by_type: Record<string, { sent: number; opened: number; campaigns: number }>
  by_festival: Record<string, { sent: number; opened: number; campaigns: number }>
  total_campaigns: number
}

export type CampaignPreview = {
  audience_count: number
  sample: { id: string; name: string | null; phone: string }[]
}

export type CampaignSendResult = {
  campaign_id: string
  audience_count: number
  sent_via: 'whatsapp_api' | 'manual_links'
  api_sent: number
  api_failed: number
  manual_links?: { customer_id: string; name: string; link: string }[]
}

export type ReactivationSuggestions = {
  inactive_days: number
  total_inactive: number
  groups: { label: string; customer_ids: string[]; count: number }[]
}

export type CampaignPayload = {
  type: CampaignType
  name: string
  message_template: string
  audience: AudienceSpec
  product_ids?: string[]
  festival_id?: number
  schedule_at?: string
  ab_variants?: AbVariant[]
}

// ─── Referrals (roadmap C) ────────────────────────────────────────

export type ReferralSettings = {
  referral_enabled: boolean
  referral_reward_paise: number
}

export type ReferralCredit = {
  id: string
  customer_id: string
  amount_paise: number
  status: 'PENDING' | 'CREDITED'
  created_at: string
}

export type Referral = {
  id: string
  customer_id: string
  code: string
  reward_paise: number
  clicks: number
  signups: number
  created_at: string
  customer: { id: string; name: string | null; phone: string } | null
  credits: ReferralCredit[]
}

// ─── Promotions (roadmap F) ───────────────────────────────────────

export type Promotion = {
  id: string
  code: string
  discount_type: 'PERCENT' | 'FIXED'
  discount_value: number
  min_order_paise: number | null
  product_ids: string[]
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  times_used: number
  created_at: string
}

export type PromotionPayload = {
  code: string
  discount_type: 'PERCENT' | 'FIXED'
  discount_value: number
  min_order_paise?: number
  product_ids?: string[]
  starts_at?: string
  ends_at?: string
  is_active?: boolean
}

// ─── Suppliers (roadmap K) ────────────────────────────────────────

export type Supplier = {
  id: string
  name: string
  phone: string | null
  city: string | null
  notes: string | null
  pending_amount_paise: number
  created_at: string
}

export type SupplierTransaction = {
  id: string
  supplier_id: string
  kind: 'ORDER' | 'PAYMENT'
  amount_paise: number
  note: string | null
  transaction_date: string
}

export type SupplierDetail = Supplier & {
  transactions: SupplierTransaction[]
}

export type SupplierPayload = {
  name: string
  phone?: string | null
  city?: string | null
  notes?: string | null
}

export type SupplierTransactionPayload = {
  kind: 'ORDER' | 'PAYMENT'
  amount_paise: number
  note?: string | null
  transaction_date?: string
}

// ─── Bookings (roadmap L) ─────────────────────────────────────────

export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export type Booking = {
  id: string
  customer_id: string | null
  name: string
  phone: string
  starts_at: string
  ends_at: string
  status: BookingStatus
  note: string | null
  created_at: string
}

export type BookingPayload = {
  customer_id?: string | null
  name: string
  phone: string
  starts_at: string
  ends_at: string
  note?: string | null
}

export type BookingUpdatePayload = Partial<BookingPayload> & {
  status?: BookingStatus
}

// ─── Inventory alerts (roadmap J) ─────────────────────────────────

export type InventoryAlert = {
  kind: 'DEAD_STOCK' | 'HIGH_VELOCITY' | 'TOP_PERFORMER' | 'UNLISTED'
  product_id: string
  product_name: string | null
  sku: string | null
  days_since_interaction: number | null
  views_30d: number
  enquiries_30d: number
  sales_30d: number
  message: string
}

export type InventoryAlertsResponse = {
  alerts: InventoryAlert[]
  counts: {
    dead_stock: number
    high_velocity: number
    top_performer: number
    unlisted: number
  }
}

// ─── Product videos (roadmap Q) ───────────────────────────────────

export type ProductVideo = {
  id: string
  product_id: string
  r2_key: string
  public_url: string
  duration_sec: number | null
  is_main: boolean
  created_at: string
}

export type VideoUploadUrl = {
  upload_url: string
  r2_key: string
  public_url: string
  expires_in: number
}

// ─── AI Translate (roadmap M) ─────────────────────────────────────

export const TRANSLATE_LANGUAGES = [
  { key: 'hindi', label: 'Hindi', hint: 'Devanagari script' },
  { key: 'hinglish', label: 'Hinglish', hint: 'Roman script, WhatsApp style' },
  { key: 'tamil', label: 'Tamil' },
  { key: 'telugu', label: 'Telugu' },
  { key: 'marathi', label: 'Marathi' },
  { key: 'gujarati', label: 'Gujarati' },
  { key: 'bengali', label: 'Bengali' },
] as const

export type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number]['key']

export type TranslateResult = {
  product_id: string
  language: string
  description: string
  cached: boolean
}

export const growthApi = {
  // ─── Referrals (roadmap C) ──────────────────────────────────────
  referralSettings: () =>
    request<{ data: ReferralSettings }>('/v1/growth/referrals/settings', {
      getCacheTtlMs: 15_000,
    }),

  updateReferralSettings: (payload: ReferralSettings) =>
    request<{ data: ReferralSettings }>('/v1/growth/referrals/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  referrals: () =>
    request<{ data: Referral[] }>('/v1/growth/referrals', { getCacheTtlMs: 15_000 }),

  createReferralCode: (customer_id: string) =>
    request<{ data: Referral }>('/v1/growth/referrals/codes', {
      method: 'POST',
      body: JSON.stringify({ customer_id }),
    }),

  /** Mark a referral as converted and create the PENDING reward credits. */
  creditReferral: (id: string) =>
    request<{ data: { count: number; message: string } }>(`/v1/growth/referrals/${id}/credit`, {
      method: 'POST',
    }),

  // ─── Promotions (roadmap F) ─────────────────────────────────────
  promotions: () =>
    request<{ data: Promotion[] }>('/v1/growth/promotions', { getCacheTtlMs: 15_000 }),

  createPromotion: (payload: PromotionPayload) =>
    request<{ data: Promotion }>('/v1/growth/promotions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePromotion: (id: string, payload: Partial<PromotionPayload>) =>
    request<{ data: Promotion }>(`/v1/growth/promotions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deletePromotion: (id: string) =>
    request<void>(`/v1/growth/promotions/${id}`, { method: 'DELETE' }),

  // ─── Suppliers (roadmap K) ──────────────────────────────────────
  suppliers: () =>
    request<{ data: Supplier[] }>('/v1/growth/suppliers', { getCacheTtlMs: 15_000 }),

  supplier: (id: string) =>
    request<{ data: SupplierDetail }>(`/v1/growth/suppliers/${id}`, { getCacheTtlMs: 15_000 }),

  createSupplier: (payload: SupplierPayload) =>
    request<{ data: Supplier }>('/v1/growth/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSupplier: (id: string, payload: Partial<SupplierPayload>) =>
    request<{ data: Supplier }>(`/v1/growth/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSupplier: (id: string) =>
    request<void>(`/v1/growth/suppliers/${id}`, { method: 'DELETE' }),

  addSupplierTransaction: (id: string, payload: SupplierTransactionPayload) =>
    request<{ data: SupplierTransaction }>(`/v1/growth/suppliers/${id}/transactions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Bookings (roadmap L) ───────────────────────────────────────
  bookings: (params?: { status?: BookingStatus }) => {
    const qs = params?.status ? `?status=${params.status}` : ''
    return request<{ data: Booking[] }>(`/v1/growth/bookings${qs}`, { getCacheTtlMs: 15_000 })
  },

  createBooking: (payload: BookingPayload) =>
    request<{ data: Booking }>('/v1/growth/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBooking: (id: string, payload: BookingUpdatePayload) =>
    request<{ data: Booking }>(`/v1/growth/bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteBooking: (id: string) =>
    request<void>(`/v1/growth/bookings/${id}`, { method: 'DELETE' }),

  // ─── Inventory alerts (roadmap J) ───────────────────────────────
  inventoryAlerts: () =>
    request<{ data: InventoryAlertsResponse }>('/v1/growth/inventory-alerts', {
      getCacheTtlMs: 60_000,
    }),

  // ─── Product videos (roadmap Q) ─────────────────────────────────
  videoUploadUrl: (
    productId: string,
    payload: { filename: string; content_type: 'video/mp4' | 'video/webm' | 'video/quicktime'; size_bytes: number },
  ) =>
    request<{ data: VideoUploadUrl }>(`/v1/growth/products/${productId}/videos/upload-url`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    }),

  registerVideo: (
    productId: string,
    payload: { r2_key: string; public_url: string; duration_sec?: number; is_main?: boolean },
  ) =>
    request<{ data: ProductVideo }>(`/v1/growth/products/${productId}/videos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  productVideos: (productId: string) =>
    request<{ data: ProductVideo[] }>(`/v1/growth/products/${productId}/videos`, {
      getCacheTtlMs: 15_000,
    }),

  deleteVideo: (videoId: string) =>
    request<void>(`/v1/growth/videos/${videoId}`, { method: 'DELETE' }),

  // ─── AI Translate (roadmap M) ───────────────────────────────────
  generateDescription: (productId: string, language: TranslateLanguage) =>
    request<{ data: TranslateResult }>(`/v1/growth/products/${productId}/descriptions`, {
      method: 'POST',
      body: JSON.stringify({ language }),
      timeoutMs: 30_000,
    }),

  // ─── Festivals (roadmap D) ──────────────────────────────────────
  festivals: (upcoming = true) => {
    const qs = upcoming ? '?upcoming=true' : ''
    return request<{ data: Festival[] }>(`/v1/growth/festivals${qs}`, { getCacheTtlMs: 60_000 })
  },

  // ─── Campaigns ──────────────────────────────────────────────────
  campaigns: () =>
    request<{ data: CampaignSummary[] }>('/v1/growth/campaigns', { getCacheTtlMs: 15_000 }),

  campaign: (id: string) =>
    request<{ data: CampaignDetail }>(`/v1/growth/campaigns/${id}`, { getCacheTtlMs: 15_000 }),

  createCampaign: (payload: CampaignPayload) =>
    request<{ data: CampaignSummary }>('/v1/growth/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCampaign: (id: string, payload: Partial<CampaignPayload>) =>
    request<{ data: CampaignSummary }>(`/v1/growth/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteCampaign: (id: string) =>
    request<void>(`/v1/growth/campaigns/${id}`, { method: 'DELETE' }),

  /** Audience count + sample names — no send. Lets the retailer sanity-check segmentation. */
  previewCampaign: (id: string) =>
    request<{ data: CampaignPreview }>(`/v1/growth/campaigns/${id}/preview`, {
      method: 'POST',
    }),

  /** Dispatch: WhatsApp Business API when configured, else per-customer wa.me links. */
  sendCampaign: (id: string) =>
    request<{ data: CampaignSendResult }>(`/v1/growth/campaigns/${id}/send`, {
      method: 'POST',
    }),

  // ─── Campaign analytics (roadmap R) ─────────────────────────────
  campaignStats: () =>
    request<{ data: CampaignStats }>('/v1/growth/campaigns/stats', { getCacheTtlMs: 60_000 }),

  // ─── Reactivation suggestions (roadmap G) ───────────────────────
  reactivationSuggestions: (inactiveDays = 60) =>
    request<{ data: ReactivationSuggestions }>('/v1/growth/reactivation-suggestions', {
      method: 'POST',
      body: JSON.stringify({ inactive_days: inactiveDays }),
    }),
}
