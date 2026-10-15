import { request } from './client'

// Retailer side of Kanchuki support sessions
// (docs/tasks/pending/support-session-access.md). Owner-only server-side.

export type SupportSessionRow = {
  id: string
  scope: 'DEMO' | 'GROWTH' | 'MAINTENANCE'
  status: 'PENDING' | 'APPROVED'
  requested_at: string
  expires_at: string | null
  staff_name: string
}

// Bodies are explicit `{}` — Fastify v5 rejects an empty body under a JSON
// content-type (see admin-bodyless-post-empty-json-400).
const post = (path: string) =>
  request<{ data: { status: string } }>(path, { method: 'POST', body: JSON.stringify({}) })

export const supportSessionApi = {
  list: () => request<{ data: SupportSessionRow[] }>('/v1/support-sessions'),
  approve: (id: string) => post(`/v1/support-sessions/${id}/approve`),
  deny: (id: string) => post(`/v1/support-sessions/${id}/deny`),
  revoke: (id: string) => post(`/v1/support-sessions/${id}/revoke`),
}

export const SUPPORT_SCOPE_LABEL: Record<SupportSessionRow['scope'], string> = {
  DEMO: 'view your shop (read-only)',
  GROWTH: 'run campaigns, promotions and social posts',
  MAINTENANCE: 'fix your catalog and profile settings',
}
