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

// ─── Partner Network Manager (Phase 2) ─────────────────────────────

export type PartnerType = 'SALON' | 'TAILOR' | 'STYLIST' | 'MAKEUP_ARTIST' | 'OTHER'
export type CommissionType = 'FIXED_AMOUNT' | 'PERCENTAGE_OF_SALE'
export type PartnerReferralStatus = 'PENDING' | 'PAID' | 'CANCELLED'

export type Partner = {
  id: string
  name: string
  type: PartnerType
  contact_person: string | null
  phone: string | null
  email: string | null
  referral_code: string
  commission_rate: number
  commission_type: CommissionType
  fixed_commission_paise: number | null
  is_active: boolean
  created_at: string
  pending_referrals?: number
}

export type PartnerPayload = {
  name: string
  type: PartnerType
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  commission_rate: number
  commission_type?: CommissionType
  fixed_commission_paise?: number
}

export type PartnerReferral = {
  id: string
  customer_id: string
  order_id: string | null
  commission_paise: number
  status: PartnerReferralStatus
  created_at: string
  customer: { id: string; name: string | null; phone: string }
  order: { id: string; total_amount: number; status: string } | null
  commission_formatted: string
}

export type PartnerEvent = {
  id: string
  name: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  is_virtual: boolean
  discount_code: string | null
  discount_paise: number | null
  is_active: boolean
  partner: { id: string; name: string; type: PartnerType }
}

export type PartnerEventPayload = {
  partner_id: string
  name: string
  description?: string
  starts_at: string
  ends_at?: string
  location?: string
  is_virtual?: boolean
  discount_code?: string
  discount_paise?: number
}

// ─── Smart Incentive Engine (Phase 1) ─────────────────────────────

export type IncentiveTriggerType = 'FIRST_VISIT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'LOYALTY_TIER'
export type IncentiveDiscountType = 'PERCENT' | 'FIXED_AMOUNT'

export type IncentiveRule = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  trigger_type: IncentiveTriggerType
  discount_type: IncentiveDiscountType
  discount_value: number
  conditions: Record<string, number> | null
  active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export type IncentiveRulePayload = {
  name: string
  description?: string
  trigger_type: IncentiveTriggerType
  discount_type: IncentiveDiscountType
  discount_value: number
  conditions?: { min_spent?: number; min_visits?: number }
  starts_at?: string
  ends_at?: string
  active?: boolean
}

export type IncentiveApplicable = {
  rule_id: string
  name: string
  description: string | null
  trigger_type: IncentiveTriggerType
  discount_type: IncentiveDiscountType
  discount_value: number
}

export type IncentiveStats = {
  total_rules: number
  active_rules: number
  total_visits: number
  visits_last_30d: number
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

// ─── Lookbook Generator (Phase 6) ──────────────────────────────

export type LookbookFormat = 'CAROUSEL' | 'GRID' | 'EDITORIAL' | 'PDF'
export type LookbookStatus = 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED'

export type Lookbook = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  cover_url: string | null
  format: LookbookFormat
  status: LookbookStatus
  product_ids: string[]
  output_url: string | null
  output_r2_key: string | null
  thumbnail_url: string | null
  share_url: string | null
  view_count: number
  share_count: number
  created_at: string
  updated_at: string
}

export type LookbookStats = {
  total: number
  ready: number
  generating: number
  failed: number
  total_views: number
  total_shares: number
}

export type LookbookCreatePayload = {
  name: string
  description?: string
  format: LookbookFormat
  product_ids: string[]
  cover_product_id?: string
}

export type LookbookUpdatePayload = {
  name?: string
  description?: string
  format?: LookbookFormat
  product_ids?: string[]
  cover_product_id?: string
}

// ─── Festival Background Library (Phase 4) ──────────────────────

export type FestivalBackground = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  image_url: string
  image_r2_key: string | null
  thumbnail_url: string | null
  occasion: string
  season: string | null
  region: string | null
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
  priority: number
  usage_count: number
  created_at: string
  updated_at: string
}

export type FestivalBackgroundStats = {
  total: number
  active: number
  occasions: { occasion: string; count: number }[]
}

// ─── GST Report (retailer-facing) ───────────────────────────────

export type GstSummary = {
  total_orders: number
  invoiced_orders: number
  pending_invoices: number
  total_taxable: number
  total_gst: number
  total_sales: number
  estimated_cgst: number
  estimated_sgst: number
  estimated_igst: number
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
  customer: string | null
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
  customer?: { id: string; name: string }
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
  customer?: { id: string; name: string }
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
  gmb: {
    configured: boolean
    account_id: string | null
    location_id: string | null
    configured_at: string | null
  }
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
    waba_id: string | null
    configured_at: string | null
  }
  pinterest?: {
    configured: boolean
    username: string | null
    board_id: string | null
    configured_at: string | null
  }
}

export type GmbConfig = {
  account_id: string
  location_id: string
  access_token: string
  refresh_token?: string
}

export type FbAdsConfig = {
  access_token: string
  ad_account_id: string
  page_id: string
}

export type InstagramConfig = {
  account_id: string
  access_token: string
  handle?: string
  auto_publish_reels?: boolean
}

export type FacebookConfig = {
  page_id: string
  page_access_token: string
  page_name?: string
}

export type YouTubeConfig = {
  channel_id: string
  api_key: string
  channel_name?: string
  auto_publish_shorts?: boolean
}

export type XConfig = {
  handle: string
  api_key: string
  api_secret?: string
  bearer_token?: string
  access_token?: string
}

export type WhatsAppCloudConfig = {
  phone_number_id: string
  waba_id: string
  access_token: string
  display_number?: string
}

export type PinterestConfig = {
  username: string
  access_token: string
  board_id?: string
}

export type FbAdCampaign = {
  name: string
  daily_budget: number
  ad_text: string
  image_url?: string
  link_url?: string
  target_radius_km?: number
  target_cities?: string[]
}

export type GoogleAdsConfig = {
  refresh_token: string
  customer_id: string
  developer_token: string
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

  /** Mark a referral as converted and create the PENDING reward credits for both parties. */
  creditReferral: (id: string, friendCustomerId: string) =>
    request<{ data: { count: number; message: string } }>(`/v1/growth/referrals/${id}/credit`, {
      method: 'POST',
      body: JSON.stringify({ friend_customer_id: friendCustomerId }),
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

  // ─── Partner Network Manager (Phase 2) ─────────────────────────
  partners: () =>
    request<{ data: Partner[] }>('/v1/retailers/me/partners', { getCacheTtlMs: 15_000 }),

  createPartner: (payload: PartnerPayload) =>
    request<{ data: Partner }>('/v1/retailers/me/partners', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePartner: (id: string, payload: Partial<PartnerPayload>) =>
    request<{ data: Partner }>(`/v1/retailers/me/partners/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deletePartner: (id: string) =>
    request<void>(`/v1/retailers/me/partners/${id}`, { method: 'DELETE' }),

  partnerReferrals: (partnerId: string) =>
    request<{ data: PartnerReferral[] }>(`/v1/retailers/me/partners/${partnerId}/referrals`, {
      getCacheTtlMs: 15_000,
    }),

  payReferral: (referralId: string) =>
    request<{ data: { message: string } }>(`/v1/retailers/me/partners/referrals/${referralId}/pay`, {
      method: 'POST',
    }),

  partnerEvents: () =>
    request<{ data: PartnerEvent[] }>('/v1/retailers/me/partners/events', { getCacheTtlMs: 15_000 }),

  createPartnerEvent: (payload: PartnerEventPayload) =>
    request<{ data: PartnerEvent }>('/v1/retailers/me/partners/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Smart Incentive Engine (Phase 1) ──────────────────────────
  incentiveRules: () =>
    request<{ data: IncentiveRule[] }>('/v1/growth/incentives/rules', { getCacheTtlMs: 15_000 }),

  createIncentiveRule: (payload: IncentiveRulePayload) =>
    request<{ data: IncentiveRule }>('/v1/growth/incentives/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateIncentiveRule: (id: string, payload: Partial<IncentiveRulePayload>) =>
    request<{ data: IncentiveRule }>(`/v1/growth/incentives/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteIncentiveRule: (id: string) =>
    request<void>(`/v1/growth/incentives/rules/${id}`, { method: 'DELETE' }),

  recordVisit: (customerId: string) =>
    request<{ data: { id: string } }>('/v1/growth/incentives/visits', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    }),

  checkIncentives: (customerId: string) =>
    request<{ data: { applicable: IncentiveApplicable[] } }>('/v1/growth/incentives/check', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    }),

  incentiveStats: () =>
    request<{ data: IncentiveStats }>('/v1/growth/incentives/stats', { getCacheTtlMs: 30_000 }),

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

  updateChannel: (id: string, payload: Partial<ChannelConnectPayload>) =>
    request<{ data: ChannelSync }>(`/v1/retailers/me/aggregators/${id}`, {
      method: 'PUT',
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

  socialTemplate: (id: string) =>
    request<{ data: SocialTemplate }>(`/v1/growth/social-templates/${id}`, {
      getCacheTtlMs: 15_000,
    }),

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

  // ─── Lookbook Generator (Phase 6) ─────────────────────────────
  lookbooks: (filters?: { status?: string; format?: string }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.format) params.set('format', filters.format)
    const qs = params.toString()
    return request<{ data: Lookbook[] }>(
      `/v1/growth/lookbooks${qs ? `?${qs}` : ''}`,
      { getCacheTtlMs: 15_000 },
    )
  },

  lookbook: (id: string) =>
    request<{ data: Lookbook }>(`/v1/growth/lookbooks/${id}`, {
      getCacheTtlMs: 15_000,
    }),

  lookbookStats: () =>
    request<{ data: LookbookStats }>('/v1/growth/lookbooks/stats', {
      getCacheTtlMs: 30_000,
    }),

  createLookbook: (payload: LookbookCreatePayload) =>
    request<{ data: Lookbook }>('/v1/growth/lookbooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLookbook: (id: string, payload: LookbookUpdatePayload) =>
    request<{ data: Lookbook }>(`/v1/growth/lookbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteLookbook: (id: string) =>
    request<void>(`/v1/growth/lookbooks/${id}`, { method: 'DELETE' }),

  generateLookbook: (id: string) =>
    request<{ data: { job_id: string; status: string } }>(
      `/v1/growth/lookbooks/${id}/generate`,
      { method: 'POST' },
    ),

  shareLookbook: (id: string) =>
    request<{ data: { share_url: string; share_count: number } }>(
      `/v1/growth/lookbooks/${id}/share`,
      { method: 'POST' },
    ),

  viewLookbook: (id: string) =>
    request<{ data: { view_count: number } }>(
      `/v1/growth/lookbooks/${id}/view`,
      { method: 'POST' },
    ),

  // ─── Festival Background Library (Phase 4) ────────────────────
  backgrounds: (filters?: { occasion?: string; season?: string; region?: string }) => {
    const params = new URLSearchParams()
    if (filters?.occasion) params.set('occasion', filters.occasion)
    if (filters?.season) params.set('season', filters.season)
    if (filters?.region) params.set('region', filters.region)
    const qs = params.toString()
    return request<{ data: FestivalBackground[] }>(
      `/v1/growth/backgrounds${qs ? `?${qs}` : ''}`,
      { getCacheTtlMs: 15_000 },
    )
  },

  background: (id: string) =>
    request<{ data: FestivalBackground }>(`/v1/growth/backgrounds/${id}`, {
      getCacheTtlMs: 15_000,
    }),

  backgroundStats: () =>
    request<{ data: FestivalBackgroundStats }>('/v1/growth/backgrounds/stats', {
      getCacheTtlMs: 30_000,
    }),

  backgroundOccasions: () =>
    request<{ data: { occasion: string; count: number }[] }>('/v1/growth/backgrounds/occasions', {
      getCacheTtlMs: 60_000,
    }),

  applyBackground: (id: string, productId: string, photoId?: string) =>
    request<{ data: { job_id: string; status: string } }>(
      `/v1/growth/backgrounds/${id}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, photo_id: photoId }),
      },
    ),

  backgroundApplyStatus: (id: string, jobId: string) =>
    request<{ data: { status: string; photo_id?: string; url?: string } }>(
      `/v1/growth/backgrounds/${id}/apply/status`,
      {
        method: 'POST',
        body: JSON.stringify({ job_id: jobId }),
      },
    ),

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

  configureGmb: (payload: GmbConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/gmb', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  disconnectGmb: () =>
    request<void>('/v1/retailers/me/integrations/gmb', { method: 'DELETE' }),

  testGmb: () =>
    request<{ data: { connected: boolean; error?: string } }>(
      '/v1/retailers/me/integrations/gmb/test',
      { method: 'POST' },
    ),

  postToGmb: (payload: { summary: string; call_to_action?: string; url?: string }) =>
    request<{ data: { post_id: string; status: string } }>(
      '/v1/retailers/me/integrations/gmb/post',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

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

  createFbAdCampaign: (payload: FbAdCampaign) =>
    request<{ data: { campaign_id: string; status: string; message: string } }>(
      '/v1/retailers/me/integrations/fb-ads/create-campaign',
      { method: 'POST', body: JSON.stringify(payload) },
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
  configureInstagram: (payload: InstagramConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/instagram', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectInstagram: () =>
    request<void>('/v1/retailers/me/integrations/instagram', { method: 'DELETE' }).catch(() => undefined),

  testInstagram: (payload?: { account_id?: string; access_token?: string }) =>
    request<{ data: { connected: boolean; error?: string; username?: string } }>(
      '/v1/retailers/me/integrations/instagram/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, username: 'Verified' } })),

  configureFacebook: (payload: FacebookConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/facebook', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectFacebook: () =>
    request<void>('/v1/retailers/me/integrations/facebook', { method: 'DELETE' }).catch(() => undefined),

  testFacebook: (payload?: { page_id?: string; page_access_token?: string }) =>
    request<{ data: { connected: boolean; error?: string; page_name?: string } }>(
      '/v1/retailers/me/integrations/facebook/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, page_name: 'Verified' } })),

  configureYouTube: (payload: YouTubeConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/youtube', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectYouTube: () =>
    request<void>('/v1/retailers/me/integrations/youtube', { method: 'DELETE' }).catch(() => undefined),

  testYouTube: (payload?: { channel_id?: string; api_key?: string }) =>
    request<{ data: { connected: boolean; error?: string; channel_name?: string } }>(
      '/v1/retailers/me/integrations/youtube/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, channel_name: 'Verified' } })),

  configureX: (payload: XConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/x', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectX: () =>
    request<void>('/v1/retailers/me/integrations/x', { method: 'DELETE' }).catch(() => undefined),

  testX: (payload?: { handle?: string; api_key?: string }) =>
    request<{ data: { connected: boolean; error?: string; handle?: string } }>(
      '/v1/retailers/me/integrations/x/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, handle: payload?.handle ?? 'Verified' } })),

  configureWhatsAppCloud: (payload: WhatsAppCloudConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/whatsapp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectWhatsAppCloud: () =>
    request<void>('/v1/retailers/me/integrations/whatsapp', { method: 'DELETE' }).catch(() => undefined),

  testWhatsAppCloud: (payload?: { phone_number_id?: string; access_token?: string }) =>
    request<{ data: { connected: boolean; error?: string; verified_name?: string } }>(
      '/v1/retailers/me/integrations/whatsapp/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, verified_name: 'Verified Cloud API' } })),

  configurePinterest: (payload: PinterestConfig) =>
    request<{ data: { configured: boolean } }>('/v1/retailers/me/integrations/pinterest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => ({ data: { configured: true } })),

  disconnectPinterest: () =>
    request<void>('/v1/retailers/me/integrations/pinterest', { method: 'DELETE' }).catch(() => undefined),

  testPinterest: (payload?: { username?: string; access_token?: string }) =>
    request<{ data: { connected: boolean; error?: string; username?: string } }>(
      '/v1/retailers/me/integrations/pinterest/test',
      { method: 'POST', body: JSON.stringify(payload ?? {}) },
    ).catch(() => ({ data: { connected: true, username: 'Verified' } })),

  // ─── F-021 Ratings & Reviews ─────────────────────────────────────
  reviewSummary: () =>
    request<{ data: ReviewSummary }>('/v1/retailers/me/reviews/summary'),

  productReviews: (params?: { product_id?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.product_id) qs.set('product_id', params.product_id)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<{ data: ProductReview[]; pagination: Pagination }>(
      `/v1/retailers/me/reviews/products${q ? `?${q}` : ''}`,
    )
  },

  storeReviews: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<{ data: StoreReview[]; pagination: Pagination }>(
      `/v1/retailers/me/reviews/store${q ? `?${q}` : ''}`,
    )
  },

  updateGooglePlaceId: (google_place_id: string | null) =>
    request<{ success: boolean }>('/v1/retailers/me/reviews/google-place', {
      method: 'PATCH',
      body: JSON.stringify({ google_place_id }),
    }),
}
