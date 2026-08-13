// Meta Graph API client (F-031, Phase 1: Facebook Page posts).
//
// Covers the three calls F-031 needs:
//   1. OAuth token exchange (code → long-lived user token → page token)
//   2. Page listing (which Pages can the retailer post to)
//   3. Publishing (photo post / link post to a Page)
//
// Env / F-012 secrets (getSecret, DB-first with env fallback):
//   META_APP_ID     — Meta for Developers app id (public-ish, plaintext ok)
//   META_APP_SECRET — app secret (server-side only)
//
// The OAuth flow is server-side: the mobile app opens a Kanchuki web page
// (apps/web/src/app/social/connect), which redirects through the Meta login
// dialog with a state token; Meta redirects back to the Kanchuki callback
// URL, and the API exchanges the code for tokens here. The retailer's own
// social tokens never touch the mobile client — they are stored encrypted
// (F-012 encryptSecret) in social_accounts.
//
// Fail closed: any non-2xx Graph API response throws with a safe message —
// the caller never reports a post that wasn't actually published.

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const OAUTH_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';

export interface MetaPage {
  id: string;
  name: string;
  /** Page access token — only present in /me/accounts responses. */
  access_token?: string;
  category?: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

interface MetaCredentials {
  appId: string;
  appSecret: string;
}

function requireCredentials(meta: MetaCredentials | null): MetaCredentials {
  if (!meta) throw new MetaApiError('Meta is not configured on the server', 500);
  return meta;
}

/**
 * Resolve platform credentials through getSecret (F-012: admin-managed DB
 * value or env var). Returns null when unconfigured — callers decide whether
 * that's a 500 (platform feature enabled but misconfigured) or a "not
 * available" state (feature not yet enabled).
 */
export async function resolveMetaCredentials(): Promise<MetaCredentials | null> {
  const { getSecret } = await import('@kanchuki/db');
  const appId = (await getSecret('META_APP_ID'))?.trim();
  const appSecret = (await getSecret('META_APP_SECRET'))?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

/** OAuth dialog URL the browser should open. state must be opaque + short-lived. */
export function buildOAuthUrl(meta: MetaCredentials, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: meta.appId,
    redirect_uri: redirectUri,
    state,
    // pages_show_list: read which Pages the user administers (connect flow)
    // pages_manage_posts: publish posts to those Pages (Phase 1 scope)
    scope: 'pages_show_list,pages_manage_posts',
    response_type: 'code',
  });
  return `${OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchange the authorization code for a long-lived user access token
 * (code → short-lived → fb_exchange_token → long-lived, ~60 days).
 * Returns the long-lived user token; the caller then calls listPages()
 * to enumerate the retailer's Pages.
 */
export async function exchangeCodeForToken(
  meta: MetaCredentials,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const shortRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      client_id: meta.appId,
      client_secret: meta.appSecret,
      redirect_uri: redirectUri,
      code,
    })}`,
  );
  const shortBody = (await shortRes.json()) as Record<string, unknown>;
  if (!shortRes.ok || typeof shortBody.access_token !== 'string') {
    throw new MetaApiError('Failed to exchange authorization code', 400, 'OAUTH_EXCHANGE_FAILED');
  }

  const longRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: meta.appId,
      client_secret: meta.appSecret,
      fb_exchange_token: shortBody.access_token as string,
    })}`,
  );
  const longBody = (await longRes.json()) as Record<string, unknown>;
  if (!longRes.ok || typeof longBody.access_token !== 'string') {
    throw new MetaApiError('Failed to obtain a long-lived token', 400, 'OAUTH_EXCHANGE_FAILED');
  }

  const expiresIn = typeof longBody.expires_in === 'number' ? longBody.expires_in : 51_840_000; // 60d
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  return { accessToken: longBody.access_token as string, expiresAt };
}

/** List the Pages the user administers (from /me/accounts with a user token). */
export async function listPages(accessToken: string): Promise<MetaPage[]> {
  const res = await fetch(`${GRAPH_BASE}/me/accounts?${new URLSearchParams({ access_token: accessToken })}`);
  const body = (await res.json()) as { data?: MetaPage[] };
  if (!res.ok || !Array.isArray(body.data)) {
    throw new MetaApiError('Failed to list Facebook Pages', 400, 'PAGES_LIST_FAILED');
  }
  return body.data.filter((p) => p.id && p.name);
}

/**
 * Publish a photo post to a Page. `imageUrl` must be a publicly fetchable
 * URL (product photo on R2); `caption` is the post text. Facebook post URLs
 * support clickable links in the caption/message, unlike Instagram (Phase 2).
 */
export async function publishPhotoPost(
  pageToken: string,
  imageUrl: string,
  caption: string,
): Promise<{ postId: string }> {
  const res = await fetch(
    `${GRAPH_BASE}/photo?${new URLSearchParams({
      access_token: pageToken,
      url: imageUrl,
      caption,
    })}`,
    { method: 'POST' },
  );
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== 'string') {
    throw new MetaApiError('Facebook rejected the photo post', 400, 'PUBLISH_FAILED');
  }
  return { postId: body.id as string };
}

/**
 * Publish a link post (message + link + optional picture) to a Page.
 * Used for COLLECTION_LINK posts where the /c/[slug] URL is the content.
 */
export async function publishLinkPost(
  pageToken: string,
  link: string,
  message: string,
  pictureUrl?: string,
): Promise<{ postId: string }> {
  const params = new URLSearchParams({ access_token: pageToken, link, message });
  if (pictureUrl) params.set('picture', pictureUrl);
  const res = await fetch(`${GRAPH_BASE}/feed?${params.toString()}`, { method: 'POST' });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== 'string') {
    throw new MetaApiError('Facebook rejected the link post', 400, 'PUBLISH_FAILED');
  }
  return { postId: body.id as string };
}
