// F-031 Social Media Publishing — mobile API client.
// Connect flow: the app opens {WEB_URL}/social/connect in the browser (the
// web page handles OTP login + Meta OAuth + Page picker). The mobile app then
// polls GET /me/social/accounts until the new account appears, and publishes
// posts via POST /me/social/accounts/:id/posts.
import { request } from './client'

export interface SocialAccountInfo {
  id: string
  platform: 'FACEBOOK' | 'INSTAGRAM'
  account_id: string
  account_name: string
  token_expires_at: string | null
  connected_at: string
}

export interface SocialPostInfo {
  id: string
  post_type: 'SINGLE_PRODUCT' | 'COLLECTION_LINK' | 'CAROUSEL'
  caption: string
  status: 'POSTED' | 'FAILED'
  external_post_url: string | null
  error_message: string | null
  product_ids: string[]
  collection_id: string | null
  created_at: string
}

export const socialApi = {
  // No getConnectUrl(): the app opens {WEB_URL}/social/connect directly — the
  // web page does its own authenticated connect via GET /me/social/connect.
  listAccounts: () =>
    request<{ data: SocialAccountInfo[] }>('/v1/retailers/me/social/accounts', {
      getCacheTtlMs: 15_000,
    }),

  disconnect: (accountId: string) =>
    request<void>(`/v1/retailers/me/social/accounts/${accountId}`, { method: 'DELETE' }),

  publishProduct: (accountId: string, productId: string, caption?: string) =>
    request<{ data: { id: string; post_type: string; external_post_url: string | null; status: string } }>(
      `/v1/retailers/me/social/accounts/${accountId}/posts`,
      {
        method: 'POST',
        body: JSON.stringify({ post_type: 'SINGLE_PRODUCT', product_id: productId, caption }),
        timeoutMs: 30_000,
      },
    ),

  publishCollection: (accountId: string, collectionId: string, caption?: string) =>
    request<{ data: { id: string; post_type: string; external_post_url: string | null; status: string } }>(
      `/v1/retailers/me/social/accounts/${accountId}/posts`,
      {
        method: 'POST',
        body: JSON.stringify({ post_type: 'COLLECTION_LINK', collection_id: collectionId, caption }),
        timeoutMs: 30_000,
      },
    ),

  listPosts: (accountId: string) =>
    request<{ data: SocialPostInfo[] }>(
      `/v1/retailers/me/social/accounts/${accountId}/posts`,
      { getCacheTtlMs: 15_000 },
    ),
}
