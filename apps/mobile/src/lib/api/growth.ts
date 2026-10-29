import { request } from './client'

// ─── India Retailer Growth Engine (docs/MARKETING.md) ──
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
  /** Roadmap S — per-variant product set (ordering = array order). */
  product_ids?: string[]
  /** Roadmap S — stagger variant B by N minutes after variant A. */
  send_delay_min?: number
}

export type CampaignSummary = {
  id: string
  type: CampaignType
  status: CampaignStatus
  name: string
  festival_name: string | null
  message_template: string
  product_ids: string[]
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
  /** Roadmap S — per-variant sent/opened once the campaign is sent. */
  variant_breakdown?: { label: string; sent: number; opened: number; open_rate: number; winner: boolean | null }[] | null
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
  manual_links?: {
    customer_id: string
    name: string
    variant_label: string | null
    product_ids: string[]
    link: string
  }[]
  variants?: { label: string; send_pct: number; product_ids: string[] }[]
}

export type GrowthAnalytics = {
  by_type: Record<string, { sent: number; opened: number; campaigns: number }>
  by_festival: Record<string, { sent: number; opened: number; campaigns: number }>
  by_segment: Record<string, { sent: number; opened: number }>
  by_hour: { hour: number; opens: number; pct: number }[]
  by_category: { category: string; views: number; enquiries: number }[]
  video_vs_photo: {
    video: { views: number; enquiries: number }
    photo: { views: number; enquiries: number }
  }
  by_variant: {
    campaign_id: string
    campaign_name: string
    variants: { label: string; sent: number; opened: number; open_rate: number }[]
    significance: { p_value: number | null; winner: string | null; reliable: boolean }
  }[]
  total_campaigns: number
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
  source: 'UPLOAD' | 'KEN_BURNS'
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

export type SuggestedProduct = {
  id: string
  name: string | null
  category: string | null
  primary_color: string | null
  price_min: number | null
}

export type AiCampaignDraft = {
  name: string
  type: 'FESTIVAL' | 'REACTIVATION' | 'PROMOTION'
  festival_id: number | null
  message_template: string
  audience: AudienceSpec
  product_ids: string[]
  schedule_hint: string | null
  rationale: string
  matched_products: SuggestedProduct[]
  audience_count: number
}

// ─── Roadmap R — Seasonal Analytics ─────────────────────────────

export type SeasonalCategory = {
  category: string
  current: { sends: number; opens: number; enquiries: number }
  compare: { sends: number; opens: number; enquiries: number }
  deltaPct: { sends: number; opens: number; enquiries: number }
}

export type SeasonalAnalytics = {
  period: { label: string; start: string; end: string }
  comparePeriod?: { label: string; start: string; end: string }
  categories: SeasonalCategory[]
  summary: {
    topCurrentCategory: string | null
    topCompareCategory: string | null
    biggestSwing: { category: string; metric: string; deltaPct: number } | null
  }
}

export type SeasonalPeriod = 'wedding' | 'daily'

// ─── F-037 Phase 4 — retailer's own engagement view ──────────────

export type EngagementTopEntry = { value: string; count: number }

export type EngagementView = {
  range_days: number
  dwell_trend: { date: string; total_dwell_ms: string; view_count: number }[]
  totals: {
    total_dwell_ms: string
    view_count: number
    search_count: number
    favorite_count: number
    unfavorite_count: number
    enquiry_count: number
    zero_result_count: number
  }
  top_products: EngagementTopEntry[]
  top_favorited_products: EngagementTopEntry[]
  top_searches: EngagementTopEntry[]
  zero_result_terms: EngagementTopEntry[]
  funnel: {
    view_count: number
    favorite_count: number
    enquiry_count: number
    view_to_favorite_pct: number
    view_to_enquiry_pct: number
  }
}

// ─── Aggregator / Marketplace Sync (Phase 7) ─────────────────────

export type ChannelType = 'MEESHO' | 'INSTAMOJO' | 'GLOAD' | 'CRAFTSVILLA' | 'FLIPKART' | 'AMAZON' | 'OTHER'
export type ChannelSyncStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'SYNCING' | 'ERROR' | 'SUSPENDED'

export type ChannelSync = {
  id: string
  channel: ChannelType
  status: ChannelSyncStatus
  last_synced_at: string | null
  last_sync_error: string | null
  products_synced: number
  orders_synced: number
  channel_shop_id: string | null
  channel_shop_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ChannelConnectPayload = {
  channel: ChannelType
  api_key: string
  api_secret?: string
  auth_token?: string
  webhook_secret?: string
  channel_shop_id?: string
  channel_shop_url?: string
}

// ─── AI Social Media Templates (Phase 5) ───────────────────────

export type SocialTemplateType =
  | 'INSTAGRAM_POST'
  | 'INSTAGRAM_REEL'
  | 'INSTAGRAM_STORY'
  | 'WHATSAPP_STATUS'
  | 'WHATSAPP_CATALOG'
  | 'FACEBOOK_POST'
  | 'FACEBOOK_STORY'
  | 'PDF_FLYER'

export type SocialTemplate = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  template_type: SocialTemplateType
  occasion: string | null
  platform: string | null
  overlay_festival: string | null
  background_style: string | null
  image_url: string | null
  image_r2_key: string | null
  caption: string | null
  hashtags: string[]
  usage_count: number
  product_ids: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SocialTemplateStats = {
  total: number
  active: number
  inactive: number
  total_usage: number
}

export type SocialTemplateCreatePayload = {
  name: string
  description?: string
  template_type: SocialTemplateType
  occasion?: string
  product_ids: string[]
  studio_template: string
}

export type SocialTemplateUpdatePayload = {
  name?: string
  description?: string
  template_type?: SocialTemplateType
  occasion?: string
  caption?: string
  hashtags?: string[]
  is_active?: boolean
}

// ─── GST Report (retailer-facing) ───────────────────────────────

export type GstSummary = {
  total_orders: number
  invoiced_orders: number
  pending_invoices: number
  total_taxable: number
  total_gst: number
  total_sales: number
  // Server field names — `cgst`/`sgst`/`igst`, NOT `estimated_*` (a
  // mismatch there crashed the mobile GST screen; fixed alongside the admin
  // GST report field mismatch in the 2026-09-08 batch).
  cgst: number
  sgst: number
  igst: number
}

export type GstMonthly = {
  year: number
  months: {
    month: number
    month_name: string
    taxable: number
    gst: number
    sales: number
    orders: number
  }[]
}

export type GstTransaction = {
  id: string
  taxable: number
  gst: number
  total: number
  invoice_number: string | null
  has_invoice: boolean
  date: string
}

export type GstTransactions = {
  transactions: GstTransaction[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

// ─── F-021 Ratings & Reviews ─────────────────────────────────────

export type ProductReview = {
  id: string
  product_id: string
  customer_id: string
  retailer_id: string
  rating: number
  comment: string | null
  is_flagged: boolean
  is_hidden: boolean
  created_at: string
  updated_at: string
  product?: { id: string; name: string | null; primary_color: string | null }
  display_name?: string | null
  customer?: { id: string; name: string } | null
}

export type StoreReview = {
  id: string
  retailer_id: string
  customer_id: string
  rating: number
  comment: string | null
  is_flagged: boolean
  is_hidden: boolean
  created_at: string
  updated_at: string
  display_name?: string | null
  customer?: { id: string; name: string } | null
}

export type ReviewSummary = {
  store: {
    avg_rating: number
    rating_count: number
    distribution: { star: number; count: number }[]
  }
  top_products: {
    id: string
    name: string | null
    avg_rating: number
    rating_count: number
    primary_color: string | null
  }[]
  recent_reviews: ((ProductReview & { type: 'product' }) | (StoreReview & { type: 'store'; product: null }))[]
  google_review_url: string | null
}

export type Pagination = {
  page: number
  limit: number
  total: number
  pages: number
}

// ─── Integrations (retailer settings) ────────────────────────────

export type IntegrationsStatus = {
  facebook_ads: {
    configured: boolean
    ad_account_id: string | null
    page_id: string | null
    configured_at: string | null
  }
  google_ads: {
    configured: boolean
    customer_id: string | null
    configured_at: string | null
  }
  instagram?: {
    configured: boolean
    account_id: string | null
    handle: string | null
    configured_at: string | null
  }
  facebook?: {
    configured: boolean
    page_id: string | null
    page_name: string | null
    configured_at: string | null
  }
  youtube?: {
    configured: boolean
    channel_id: string | null
    channel_name: string | null
    configured_at: string | null
  }
  x?: {
    configured: boolean
    handle: string | null
    configured_at: string | null
  }
  whatsapp?: {
    configured: boolean
    phone_number_id: string | null
    configured_at: string | null
  }
  pinterest?: {
    configured: boolean
    username: string | null
    board_id: string | null
    configured_at: string | null
  }
}

export type FbAdsConfig = {
  access_token: string
  ad_account_id: string
  page_id: string
}

export type GoogleAdsConfig = {
  refresh_token: string
  customer_id: string
  developer_token: string
}

export const growthApi = {
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

  // ─── Inventory alerts (roadmap J) ───────────────────────────────
  inventoryAlerts: () =>
    request<{ data: InventoryAlertsResponse }>('/v1/growth/inventory-alerts', {
      getCacheTtlMs: 60_000,
    }),

  // ─── Product videos (roadmap Q) ─────────────────────────────────
  videoUploadUrl: (
    productId: string,
    payload: { filename: string; content_type: 'video/mp4' | 'video/webm' | 'video/quicktime'; size_bytes: number; content_length?: number },
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

  // F-033 Slice 1: Ken Burns pan/zoom slideshow built from the product's
  // own photos server-side — no file to upload, just enqueues the job.
  generateVideo: (productId: string) =>
    request<{ data: { message: string } }>(`/v1/growth/products/${productId}/video/generate`, {
      method: 'POST',
    }),

  // ─── AI Translate (roadmap M) ───────────────────────────────────
  generateDescription: (productId: string, language: TranslateLanguage) =>
    request<{ data: TranslateResult }>(`/v1/growth/products/${productId}/descriptions`, {
      method: 'POST',
      body: JSON.stringify({ language }),
      timeoutMs: 30_000,
    }),

  /** Roadmap M — localize a WhatsApp/campaign message, preserving {{placeholders}}. */
  translateMessage: (message: string, language: TranslateLanguage, context?: string) =>
    request<{ data: { message: string; language: string; placeholders_preserved: boolean } }>(
      '/v1/growth/translate/message',
      {
        method: 'POST',
        body: JSON.stringify({ message, language, context }),
        timeoutMs: 30_000,
      },
    ),

  // ─── Campaign analytics (roadmap R) ─────────────────────────────
  analytics: () =>
    request<{ data: GrowthAnalytics }>('/v1/growth/analytics', { getCacheTtlMs: 60_000 }),

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
      timeoutMs: 120_000, // synchronous one-message-per-customer fan-out (RC-121)
    }),

  // ─── Campaign analytics (roadmap R) ─────────────────────────────
  campaignStats: () =>
    request<{ data: CampaignStats }>('/v1/growth/campaigns/stats', { getCacheTtlMs: 60_000 }),

  // ─── AI Campaign Assistant (roadmap E) ───────────────────────────
  aiCampaign: (prompt: string) =>
    request<{ data: AiCampaignDraft }>('/v1/growth/ai-campaign', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      timeoutMs: 60_000,
    }),

  // ─── Reactivation suggestions (roadmap G) ───────────────────────
  reactivationSuggestions: (inactiveDays = 60) =>
    request<{ data: ReactivationSuggestions }>('/v1/growth/reactivation-suggestions', {
      method: 'POST',
      body: JSON.stringify({ inactive_days: inactiveDays }),
    }),

  // ─── Seasonal analytics (roadmap R) ─────────────────────────────
  seasonal: (period: SeasonalPeriod = 'wedding') =>
    request<{ data: SeasonalAnalytics }>(
      `/v1/growth/analytics/seasonal?period=${period}`,
      { getCacheTtlMs: 60_000 },
    ),

  // ─── Engagement (F-037 Phase 4) — own store, aggregate only ─────
  engagement: (days = 30) =>
    request<{ data: EngagementView }>(`/v1/growth/engagement?days=${days}`, {
      getCacheTtlMs: 60_000,
    }),

  // ─── Aggregator / Marketplace Sync (Phase 7) ──────────────────
  aggregators: () =>
    request<{ data: ChannelSync[] }>('/v1/retailers/me/aggregators', { getCacheTtlMs: 15_000 }),

  aggregator: (id: string) =>
    request<{ data: ChannelSync }>(`/v1/retailers/me/aggregators/${id}`, { getCacheTtlMs: 15_000 }),

  connectChannel: (payload: ChannelConnectPayload) =>
    request<{ data: ChannelSync }>('/v1/retailers/me/aggregators', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  disconnectChannel: (id: string) =>
    request<void>(`/v1/retailers/me/aggregators/${id}`, { method: 'DELETE' }),

  triggerSync: (id: string) =>
    request<{ data: { message: string; channel: string; status: string } }>(
      `/v1/retailers/me/aggregators/${id}/sync`,
      { method: 'POST' },
    ),

  // ─── AI Social Media Templates (Phase 5) ─────────────────────
  socialTemplates: (filters?: { template_type?: string; occasion?: string }) => {
    const params = new URLSearchParams()
    if (filters?.template_type) params.set('template_type', filters.template_type)
    if (filters?.occasion) params.set('occasion', filters.occasion)
    const qs = params.toString()
    return request<{ data: SocialTemplate[] }>(
      `/v1/growth/social-templates${qs ? `?${qs}` : ''}`,
      { getCacheTtlMs: 15_000 },
    )
  },

  socialTemplateStats: () =>
    request<{ data: SocialTemplateStats }>('/v1/growth/social-templates/stats', {
      getCacheTtlMs: 30_000,
    }),

  createSocialTemplate: (payload: SocialTemplateCreatePayload) =>
    request<{ data: SocialTemplate }>('/v1/growth/social-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSocialTemplate: (id: string, payload: SocialTemplateUpdatePayload) =>
    request<{ data: SocialTemplate }>(`/v1/growth/social-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSocialTemplate: (id: string) =>
    request<void>(`/v1/growth/social-templates/${id}`, { method: 'DELETE' }),

  generateSocialTemplate: (id: string, productId?: string) =>
    request<{ data: { job_id: string; status: string } }>(
      `/v1/growth/social-templates/${id}/generate`,
      {
        method: 'POST',
        body: JSON.stringify(productId ? { product_id: productId } : {}),
      },
    ),

  socialTemplateGenerateStatus: (id: string, jobId: string) =>
    request<{ data: { status: string; photo_id?: string; url?: string } }>(
      `/v1/growth/social-templates/${id}/generate/status?job_id=${jobId}`,
    ),

  useSocialTemplate: (id: string) =>
    request<{ data: SocialTemplate }>(`/v1/growth/social-templates/${id}/use`, {
      method: 'POST',
    }),

  // ─── GST Report (retailer-facing) ─────────────────────────────
  gstSummary: (filters?: { month?: number; year?: number }) => {
    const params = new URLSearchParams()
    if (filters?.month) params.set('month', String(filters.month))
    if (filters?.year) params.set('year', String(filters.year))
    const qs = params.toString()
    return request<{ data: GstSummary }>(
      `/v1/growth/gst/summary${qs ? `?${qs}` : ''}`,
      { getCacheTtlMs: 30_000 },
    )
  },

  gstMonthly: (year?: number) => {
    const qs = year ? `?year=${year}` : ''
    return request<{ data: GstMonthly }>(
      `/v1/growth/gst/monthly${qs}`,
      { getCacheTtlMs: 30_000 },
    )
  },

  gstTransactions: (filters?: {
    month?: number
    year?: number
    invoiced?: boolean
    page?: number
  }) => {
    const params = new URLSearchParams()
    if (filters?.month) params.set('month', String(filters.month))
    if (filters?.year) params.set('year', String(filters.year))
    if (filters?.invoiced !== undefined) params.set('invoiced', String(filters.invoiced))
    if (filters?.page) params.set('page', String(filters.page))
    const qs = params.toString()
    return request<{ data: GstTransactions }>(
      `/v1/growth/gst/transactions${qs ? `?${qs}` : ''}`,
      { getCacheTtlMs: 15_000 },
    )
  },

  // ─── Integrations (retailer settings) ──────────────────────────
  integrations: () =>
    request<{ data: IntegrationsStatus }>('/v1/retailers/me/integrations', {
      getCacheTtlMs: 15_000,
    }),

  configureFbAds: (payload: FbAdsConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/fb-ads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  disconnectFbAds: () =>
    request<void>('/v1/retailers/me/integrations/fb-ads', { method: 'DELETE' }),

  testFbAds: () =>
    request<{ data: { connected: boolean; error?: string; account_name?: string } }>(
      '/v1/retailers/me/integrations/fb-ads/test',
      { method: 'POST' },
    ),

  configureGoogleAds: (payload: GoogleAdsConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/google-ads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  disconnectGoogleAds: () =>
    request<void>('/v1/retailers/me/integrations/google-ads', { method: 'DELETE' }),

  testGoogleAds: () =>
    request<{ data: { connected: boolean; error?: string } }>(
      '/v1/retailers/me/integrations/google-ads/test',
      { method: 'POST' },
    ),

  // ─── Social Media Integrations ───────────────────────────────────
  disconnectInstagram: () =>
    request<void>('/v1/retailers/me/integrations/instagram', { method: 'DELETE' }),

  disconnectFacebook: () =>
    request<void>('/v1/retailers/me/integrations/facebook', { method: 'DELETE' }),

  // ─── F-021 Ratings & Reviews ─────────────────────────────────────
  reviewSummary: () =>
    request<{ data: ReviewSummary }>('/v1/retailers/reviews/summary'),

  productReviews: (params?: { product_id?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.product_id) qs.set('product_id', params.product_id)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<{ data: ProductReview[]; pagination: Pagination }>(
      `/v1/retailers/reviews/products${q ? `?${q}` : ''}`,
    )
  },

  storeReviews: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<{ data: StoreReview[]; pagination: Pagination }>(
      `/v1/retailers/reviews/store${q ? `?${q}` : ''}`,
    )
  },
}
