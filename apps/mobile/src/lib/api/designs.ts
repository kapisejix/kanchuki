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

export const designTemplatesApi = {
  list: () =>
    request<{ data: DesignTemplateRow[] }>('/v1/retailers/me/designs', { getCacheTtlMs: 30_000 }),

  render: (id: string, body: RenderDesignInput) =>
    request<{ data: { image_url: string; image_key: string } }>(
      `/v1/retailers/me/designs/${encodeURIComponent(id)}/render`,
      { method: 'POST', body: JSON.stringify(body), timeoutMs: 60_000 },
    ),
}
