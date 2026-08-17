import { request } from './client'

// ─── India Retailer Growth Engine (docs/INDIA-RETAILER-GROWTH.md) ──
// Campaign + festival endpoints only for now — the rest of the modules
// (referrals, promotions, suppliers, bookings, inventory, videos,
// translate) land with their UI in later passes.

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

export const growthApi = {
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
