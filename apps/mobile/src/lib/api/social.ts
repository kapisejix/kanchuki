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
  getConnectUrl: (provider: 'instagram' | 'facebook' | 'youtube' | 'x' = 'instagram', redirectUri?: string) =>
    request<{ data: { auth_url: string; state: string; provider: string } }>(
      `/v1/retailers/me/social/connect?provider=${provider}&redirect_uri=${encodeURIComponent(
        redirectUri || 'kanchuki://oauth/callback',
      )}`,
    ),

  /**
   * Native FB SDK path — exchange a short-lived on-device user token for a
   * stored Page (server calls fb_exchange_token, then listPages/upsert).
   * No OAuth code, no redirect URI, no web page, no OTP.
   */
  connectWithToken: (accessToken: string, provider: 'facebook' | 'instagram' = 'facebook') =>
    request<{
      data: {
        connected: boolean
        provider: string
        handle?: string
        account_id?: string
        account_name?: string
      }
    }>('/v1/retailers/me/social/connect-native', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken, provider }),
      timeoutMs: 30_000,
    }),

  autoConnect: (payload: {
    code: string;
    state: string;
    provider: 'instagram' | 'facebook' | 'youtube' | 'x';
    redirect_uri?: string;
  }) =>
    request<{
      data: {
        connected: boolean;
        provider: string;
        handle?: string;
        account_id?: string;
        account_name?: string;
      };
    }>('/v1/retailers/me/social/auto-connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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
