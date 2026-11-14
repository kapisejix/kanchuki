import { request } from './client'

// Admin-made post designs (docs/tasks/pending/admin-social-design-templates.md T4).
// The server fills price / shop name / logo from the retailer's own rows; the app only
// sends product ids and the two free-text vars.

export type DesignTemplateRow = {
  id: string
  name: string
  description: string | null
  occasion: string | null
  format: 'SQUARE' | 'PORTRAIT_4_5' | 'STORY_9_16' | string
  product_slots: number
  thumbnail_url: string | null
}

export type RenderDesignInput = {
  product_ids: string[]
  custom_text?: string
  offer_text?: string
}

// T5 — paid AI custom-prompt design. POST answers 202 {id}; poll GET /:id until READY/FAILED.
// Needs the AI_CUSTOM_TEMPLATE plan feature + quota (402 with a plain message otherwise).
export type AiDesignStatus = {
  id: string
  status: 'PENDING' | 'READY' | 'FAILED'
  image_url: string | null
  error: string | null
}

export type AiDesignRow = {
  id: string
  prompt: string
  image_url: string | null
  created_at: string
}

export type AiDesignFormat = 'ORIGINAL' | 'SQUARE' | 'PORTRAIT' | 'STORY'
/** Free overlays drawn by the server after the AI image (price strip / badge / store logo). */
export type AiDesignOverlay = 'white_price' | 'new_arrival' | 'logo_corner'

export const aiDesignsApi = {
  create: (body: {
    product_id: string
    prompt: string
    format?: AiDesignFormat
    overlay?: AiDesignOverlay | null
  }) =>
    request<{ data: { id: string; status: 'PENDING' } }>('/v1/retailers/me/ai-designs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  get: (id: string) =>
    request<{ data: AiDesignStatus }>(`/v1/retailers/me/ai-designs/${encodeURIComponent(id)}`),

  list: () => request<{ data: AiDesignRow[] }>('/v1/retailers/me/ai-designs'),
}

export const designTemplatesApi = {
  list: () =>
    request<{ data: DesignTemplateRow[] }>('/v1/retailers/me/designs', { getCacheTtlMs: 30_000 }),

  render: (id: string, body: RenderDesignInput) =>
    request<{ data: { image_url: string; image_key: string } }>(
      `/v1/retailers/me/designs/${encodeURIComponent(id)}/render`,
      { method: 'POST', body: JSON.stringify(body), timeoutMs: 60_000 },
    ),
}
