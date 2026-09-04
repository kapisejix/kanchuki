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

// ─── Composer fan-out (POST /me/social/posts — T-3.1) ───────────────────
// Types mirror the API bodySchema + per-target result rows (§6.1). The
// client mints `client_post_id` so a retry of the same tap dedupes (R-13).

/** Post shapes the composer can produce. */
export type SocialPostComposeType = 'SINGLE_PRODUCT' | 'CAROUSEL' | 'COLLECTION_LINK'

/** What the post's link card resolves to (server-owned resolution, R-11). */
export type SocialLinkType = 'none' | 'collection' | 'storefront' | 'product'

/** One media item inside a fan-out payload — a photo XOR a video. */
export interface SocialPostItem {
  product_id: string
  photo_id?: string
  video_id?: string
}

/** Payload for POST /me/social/posts. */
export interface CreateSocialPostInput {
  client_post_id: string
  post_type: SocialPostComposeType
  /** Connected social account ids to fan out to (1..n). */
  targets: string[]
  items?: SocialPostItem[]
  collection_id?: string
  link_type?: SocialLinkType
  link_product_id?: string
  caption?: string
  /** Admin post template used for this publish (usage_count += 1 server-side). */
  template_id?: string
}

/** One target's outcome in the fan-out result array (partial success expected). */
export interface SocialPostTargetResult {
  social_account_id: string
  platform: 'FACEBOOK' | 'INSTAGRAM'
  status: 'POSTED' | 'FAILED'
  external_post_url: string | null
  social_post_id: string
  error_message: string | null
  /** True when this row came from an idempotent retry, not a fresh publish. */
  deduplicated?: boolean
}

/**
 * Admin-curated, plan-gated post template (T-9.6, §11). The retailer picks
 * one in the composer; the API resolves its {placeholders} authoritatively at
 * publish and bumps `usage_count`. Mirror of the retailer-facing
 * GET /v1/post-templates response.
 */
export interface PostTemplateInfo {
  id: string
  name: string
  description: string | null
  context: 'POST' | 'CAMPAIGN' | 'BOTH'
  post_type: SocialPostComposeType | null // hint; null = retailer decides
  caption_template: string // contains {placeholders}, resolved at publish
  hashtags: string[]
  occasion: string | null
  thumbnail_url: string | null
  usage_count: number
}

export const socialApi = {
  // No redirect_uri param → the API defaults to an https URL it owns
  // (WEB_URL/social/connect) — Facebook Login rejects custom schemes like
  // kanchuki:// with a generic error (#9).
  getConnectUrl: (provider: 'instagram' | 'facebook' | 'youtube' | 'x' = 'instagram', redirectUri?: string) =>
    request<{ data: { auth_url: string; state: string; provider: string } }>(
      `/v1/retailers/me/social/connect?provider=${provider}${
        redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ''
      }`,
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

  listPosts: (accountId: string) =>
    request<{ data: SocialPostInfo[] }>(
      `/v1/retailers/me/social/accounts/${accountId}/posts`,
      { getCacheTtlMs: 15_000 },
    ),

  /**
   * Admin post-template library for the composer picker (T-9.6). Only
   * PUBLISHED templates on the retailer's plan are returned; `context`
   * narrows the picker surface (BOTH-inclusive OR handled server-side).
   */
  listPostTemplates: (context?: 'POST' | 'CAMPAIGN' | 'BOTH') =>
    request<{ data: PostTemplateInfo[] }>(
      `/v1/post-templates${context ? `?context=${context}` : ''}`,
      { getCacheTtlMs: 60_000 },
    ),

  /**
   * AI caption suggestion for the composer caption field (R-9 / T-6.1).
   * The server derives product names / price / category from the retailer's
   * own rows and fails open to the templated auto-caption when AI or quota
   * is unavailable — so this never hard-fails a publish flow.
   */
  suggestCaption: (payload: {
    product_ids: string[]
    post_type: SocialPostComposeType
  }) =>
    request<{ data: { caption: string; hashtags: string[]; source: 'ai' | 'template' } }>(
      '/v1/growth/social-caption-suggest',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 30_000,
      },
    ),

  /**
   * Composer fan-out — one post to many accounts in a single request (R-12).
   * Longer timeout than the per-account publish: a multi-target carousel
   * runs sequential Meta API calls plus IG container polling.
   */
  createPost: (payload: CreateSocialPostInput) =>
    request<{ data: { results: SocialPostTargetResult[] } }>(
      '/v1/retailers/me/social/posts',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 60_000,
      },
    ),
}
