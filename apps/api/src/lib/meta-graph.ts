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

// Instagram caption hard limit (Meta platform rule). Facebook's cap is
// 63,206 chars, so only IG targets need clamping — a server-appended
// '\n\n' + link URL used to push a near-max caption past the limit (finding 5a
// in docs/tasks/social-create-post-composer.md §12).
export const IG_CAPTION_LIMIT = 2200;

/**
 * Clamp a caption to Instagram's 2,200-char limit. Code-point aware (emoji
 * and other astral chars are never split mid-surrogate). Applied at the
 * platform boundary in every IG publish helper so no caller can exceed the
 * limit.
 */
export function clampIgCaption(caption: string): string {
  const chars = Array.from(caption);
  return chars.length > IG_CAPTION_LIMIT ? chars.slice(0, IG_CAPTION_LIMIT).join('') : caption;
}

/**
 * Fetch a published IG media id's real permalink (the Graph API `permalink`
 * field). Fail-open — the post IS live, a permalink miss must not surface as a
 * failure or risk a double-publish (same rule the carousel path follows).
 * Never fabricate `instagram.com/p/<media-id>` from the media id: it is not a
 * shortcode and 404s in history / "View post" (finding 3, task doc §12).
 */
export async function fetchIgPermalink(mediaId: string, accessToken: string): Promise<string> {
  try {
    const linkRes = await fetch(
      `${GRAPH_BASE}/${mediaId}?${new URLSearchParams({
        access_token: accessToken,
        fields: 'permalink',
      })}`,
    );
    const linkBody = (await linkRes.json()) as Record<string, unknown>;
    if (linkRes.ok && typeof linkBody.permalink === 'string') {
      return linkBody.permalink as string;
    }
  } catch {
    // network/parse blip — permalink is presentational, fail open
  }
  return '';
}

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
export function buildOAuthUrl(
  meta: MetaCredentials,
  redirectUri: string,
  state: string,
  _provider: 'instagram' | 'facebook' | 'both' = 'both',
): string {
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
    'business_management',
  ];

  const params = new URLSearchParams({
    client_id: meta.appId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
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

/**
 * Turn a short-lived user token — e.g. the one the native Facebook SDK returns
 * on-device after the retailer taps "Continue" in the FB app — into a
 * long-lived (~60d) user token. Same fb_exchange_token step as
 * exchangeCodeForToken, minus the code→token leg the SDK already did. No
 * redirect_uri involved, so this works with the app-to-app SDK flow (no web
 * OAuth dialog, no https callback, no phone OTP).
 */
export async function exchangeUserTokenForLongLived(
  meta: MetaCredentials,
  shortToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: meta.appId,
      client_secret: meta.appSecret,
      fb_exchange_token: shortToken,
    })}`,
  );
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== 'string') {
    throw new MetaApiError('Failed to obtain a long-lived token', 400, 'OAUTH_EXCHANGE_FAILED');
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 51_840_000;
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

export interface MetaInstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  page_id?: string;
  page_name?: string;
}

/** List connected Instagram Business / Creator accounts across the user's Pages. */
export async function listInstagramAccounts(accessToken: string): Promise<MetaInstagramAccount[]> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/accounts?${new URLSearchParams({
        access_token: accessToken,
        fields:
          'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
      })}`,
    );
    const body = (await res.json()) as {
      data?: Array<{
        id: string;
        name: string;
        instagram_business_account?: {
          id: string;
          username: string;
          name?: string;
          profile_picture_url?: string;
        };
      }>;
    };

    if (!res.ok || !Array.isArray(body.data)) {
      return [];
    }

    const results: MetaInstagramAccount[] = [];
    for (const page of body.data) {
      if (page.instagram_business_account) {
        results.push({
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
          name: page.instagram_business_account.name || page.name,
          profile_picture_url: page.instagram_business_account.profile_picture_url,
          page_id: page.id,
          page_name: page.name,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** List the Pages the user administers (from /me/accounts with a user token). */
export async function listPages(accessToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${GRAPH_BASE}/me/accounts?${new URLSearchParams({ access_token: accessToken })}`,
  );
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
 *
 * The endpoint is the Page's `photos` edge (POST /{page-id}/photos with a
 * `url` param) — a bare POST /photo node does not create photos.
 */
export async function publishPhotoPost(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string,
): Promise<{ postId: string }> {
  const res = await fetch(
    `${GRAPH_BASE}/${pageId}/photos?${new URLSearchParams({
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
 * Publish a video post to a Page (F-033 Slice 2). `videoUrl` must be a
 * publicly fetchable URL (product video on R2); `caption` becomes the
 * video's description.
 *
 * The endpoint is the Page's `videos` edge (POST /{page-id}/videos with a
 * `file_url` param, mirroring publishPhotoPost's `url` param on `/photos`).
 */
export async function publishVideoPost(
  pageId: string,
  pageToken: string,
  videoUrl: string,
  caption: string,
): Promise<{ postId: string }> {
  const res = await fetch(
    `${GRAPH_BASE}/${pageId}/videos?${new URLSearchParams({
      access_token: pageToken,
      file_url: videoUrl,
      description: caption,
    })}`,
    { method: 'POST' },
  );
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== 'string') {
    throw new MetaApiError('Facebook rejected the video post', 400, 'PUBLISH_FAILED');
  }
  return { postId: body.id as string };
}

/**
 * Publish a link post (message + link + optional picture) to a Page.
 * Used for COLLECTION_LINK posts where the /c/[slug] URL is the content.
 *
 * The endpoint is the Page's `feed` edge (POST /{page-id}/feed) — a bare
 * POST /feed node does not create posts.
 */
export async function publishLinkPost(
  pageId: string,
  pageToken: string,
  link: string,
  message: string,
  pictureUrl?: string,
): Promise<{ postId: string }> {
  const params = new URLSearchParams({ access_token: pageToken, link, message });
  if (pictureUrl) params.set('picture', pictureUrl);
  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed?${params.toString()}`, { method: 'POST' });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== 'string') {
    throw new MetaApiError('Facebook rejected the link post', 400, 'PUBLISH_FAILED');
  }
  return { postId: body.id as string };
}

/**
 * Publish a multi-photo (carousel) post to a Page. Two steps, mirroring the
 * Graph API's required flow:
 *   1. Upload each image with `published=false` → collect { media_fbid }.
 *   2. POST /{page-id}/feed with `attached_media[i]` entries + message (+
 *      optional link card).
 * Fail closed: any non-2xx throws MetaApiError; nothing is reported as
 * published unless the feed POST returns an id.
 */
export async function publishFacebookCarousel(
  pageId: string,
  pageToken: string,
  images: string[],
  caption: string,
  link?: string,
): Promise<{ postId: string }> {
  if (images.length === 0) {
    throw new MetaApiError('A carousel needs at least one image', 400, 'EMPTY_CAROUSEL');
  }

  const mediaFbids: string[] = [];
  for (const url of images) {
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}/photos?${new URLSearchParams({
        access_token: pageToken,
        url,
        published: 'false',
      })}`,
      { method: 'POST' },
    );
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok || typeof body.id !== 'string') {
      throw new MetaApiError('Facebook rejected a carousel photo', 400, 'PUBLISH_FAILED');
    }
    mediaFbids.push(body.id as string);
  }

  const params = new URLSearchParams({ access_token: pageToken, message: caption });
  mediaFbids.forEach((mediaFbid, i) => {
    params.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: mediaFbid }));
  });
  if (link) params.set('link', link);

  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed?${params.toString()}`, { method: 'POST' });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== 'string') {
    throw new MetaApiError('Facebook rejected the carousel post', 400, 'PUBLISH_FAILED');
  }
  return { postId: body.id as string };
}

/**
 * Publish a photo carousel to an Instagram Business account. Flow:
 *   1. Create each child container (`is_carousel_item=true`), polling the
 *      returned id until its status_code leaves IN_PROGRESS.
 *   2. Create the CAROUSEL parent container with `children` + caption (also
 *      polled — IG is async for video; photos are usually instant).
 *   3. Publish the parent via /media_publish.
 *   4. Best-effort permalink fetch (fail-open: the post IS live, a permalink
 *      miss must not surface as a failure and risk a double-publish).
 * Fail closed on the publish-critical steps: container ERROR/EXPIRED or a
 * non-2xx on create/publish throws MetaApiError.
 */
export async function publishInstagramCarousel(
  igUserId: string,
  accessToken: string,
  images: string[],
  caption: string,
): Promise<{ postId: string; permalink: string }> {
  if (images.length === 0) {
    throw new MetaApiError('A carousel needs at least one image', 400, 'EMPTY_CAROUSEL');
  }

  const childIds: string[] = [];
  for (const url of images) {
    const res = await fetch(
      `${GRAPH_BASE}/${igUserId}/media?${new URLSearchParams({
        access_token: accessToken,
        image_url: url,
        is_carousel_item: 'true',
      })}`,
      { method: 'POST' },
    );
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok || typeof body.id !== 'string') {
      throw new MetaApiError(
        'Instagram rejected a carousel child',
        400,
        'INSTAGRAM_CONTAINER_FAILED',
      );
    }
    const childId = body.id as string;
    // The create response often already carries a terminal status (photos are
    // instant); only poll when it is still IN_PROGRESS (or missing).
    await ensureIgContainerReady(childId, accessToken, body.status_code);
    childIds.push(childId);
  }

  const parentRes = await fetch(
    `${GRAPH_BASE}/${igUserId}/media?${new URLSearchParams({
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      // IG captions cap at 2,200 chars — clamp at the platform boundary
      // (finding 5a) so a server-appended link can never exceed the limit.
      caption: clampIgCaption(caption),
    })}`,
    { method: 'POST' },
  );
  const parentBody = (await parentRes.json()) as Record<string, unknown>;
  if (!parentRes.ok || typeof parentBody.id !== 'string') {
    throw new MetaApiError('Instagram rejected the carousel', 400, 'INSTAGRAM_CONTAINER_FAILED');
  }
  const parentId = parentBody.id as string;
  await ensureIgContainerReady(parentId, accessToken, parentBody.status_code);

  const publishRes = await fetch(
    `${GRAPH_BASE}/${igUserId}/media_publish?${new URLSearchParams({
      access_token: accessToken,
      creation_id: parentId,
    })}`,
    { method: 'POST' },
  );
  const publishBody = (await publishRes.json()) as Record<string, unknown>;
  if (!publishRes.ok || typeof publishBody.id !== 'string') {
    throw new MetaApiError('Instagram rejected the media publish', 400, 'INSTAGRAM_PUBLISH_FAILED');
  }
  const postId = publishBody.id as string;
  // Permalink is presentational — fail-open (shared helper, finding 3).
  const permalink = await fetchIgPermalink(postId, accessToken);
  return { postId, permalink };
}

const IG_POLL_ATTEMPTS = 10;
const IG_POLL_DELAY_MS = 2000;

/**
 * Ensure an IG container is ready to publish. A create response that already
 * reports FINISHED skips the poll entirely (photos are usually instant).
 * IN_PROGRESS (or an absent status) triggers a bounded status_code poll;
 * ERROR/EXPIRED fail closed.
 */
async function ensureIgContainerReady(
  containerId: string,
  accessToken: string,
  initialStatusCode?: unknown,
): Promise<void> {
  if (initialStatusCode === 'FINISHED') return;
  if (initialStatusCode === 'ERROR' || initialStatusCode === 'EXPIRED') {
    throw new MetaApiError('Instagram container failed', 400, 'INSTAGRAM_CONTAINER_FAILED');
  }
  for (let attempt = 0; attempt < IG_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?${new URLSearchParams({
        access_token: accessToken,
        fields: 'status_code',
      })}`,
    );
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new MetaApiError(
        'Instagram container status check failed',
        400,
        'INSTAGRAM_CONTAINER_FAILED',
      );
    }
    if (body.status_code === 'FINISHED') return;
    if (body.status_code === 'ERROR' || body.status_code === 'EXPIRED') {
      throw new MetaApiError('Instagram container failed', 400, 'INSTAGRAM_CONTAINER_FAILED');
    }
    // IN_PROGRESS (or a transient missing status) — poll again after a delay.
    await new Promise((resolve) => setTimeout(resolve, IG_POLL_DELAY_MS));
  }
  throw new MetaApiError(
    'Instagram container did not finish in time',
    400,
    'INSTAGRAM_CONTAINER_FAILED',
  );
}
