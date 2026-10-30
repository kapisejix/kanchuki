import { request } from './client'

// Google Business Profile reviews (owner-only; docs/tasks/pending/google-business-profile-and-setup-checklist.md).
// The server decides everything: this client never sends a Google account/location id.

export type GbpState = 'UNAVAILABLE' | 'NOT_REQUESTED' | 'REQUESTED' | 'LINKED' | 'NEEDS_ACCESS'

export type GbpStatus = {
  state: GbpState
  location_title?: string | null
  last_synced_at?: string | null
  avg_rating?: number | null
  review_count?: number | null
  manager_email?: string | null
  steps?: string[]
}

export type GbpReview = {
  id: string
  reviewer_name: string | null
  star_rating: number
  comment: string | null
  created_at: string
  reply: { comment: string; updated_at: string | null } | null
}

export const googleBusinessApi = {
  status: () => request<{ data: GbpStatus }>('/v1/retailers/me/google-business/status'),
  requestLink: () =>
    request<{ data: GbpStatus }>('/v1/retailers/me/google-business/request', {
      method: 'POST',
      body: JSON.stringify({ consent: true }),
    }),
  reviews: (cursor?: string) =>
    request<{
      data: {
        summary: {
          avg_rating: number | null
          review_count: number | null
          last_synced_at: string | null
        }
        reviews: GbpReview[]
        next_cursor: string | null
      }
    }>(
      `/v1/retailers/me/google-business/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  reply: (reviewId: string, comment: string) =>
    request<{ data: { reply: { comment: string; updated_at: string } } }>(
      `/v1/retailers/me/google-business/reviews/${encodeURIComponent(reviewId)}/reply`,
      { method: 'POST', body: JSON.stringify({ comment }) },
    ),
  unlink: () => request<void>('/v1/retailers/me/google-business/link', { method: 'DELETE' }),
}
