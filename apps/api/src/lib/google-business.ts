// Google Business Profile client — Part B of
// docs/tasks/pending/google-business-profile-and-setup-checklist.md.
//
// ONE shared Kanchuki Google identity (a Super Admin connects it once; retailers add its
// email as a Manager on their profile). Reads reviews and writes REPLIES only. There is
// deliberately no function that creates a review — Google offers none, and a test pins it.
//
// No fallbacks: every failure surfaces as a typed GbpError. Nothing here returns empty
// "ok" data when Google refused (RC-056/058/060).

import { encryptSecret, getSecret, invalidateSecret, maskSecret, prisma } from '@kanchuki/db';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const LOCATIONS_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4 = 'https://mybusiness.googleapis.com/v4';
const SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email'];
const TIMEOUT_MS = 10_000;

export const GBP_KEYS = {
  refreshToken: 'GBP_REFRESH_TOKEN',
  email: 'GBP_CONNECTED_EMAIL',
  approved: 'GBP_API_APPROVED',
} as const;

export type GbpErrorCode =
  | 'NOT_CONNECTED' // no shared Google identity stored yet
  | 'NOT_APPROVED' // Google has not approved API access (quota 0 / API disabled)
  | 'NEEDS_ACCESS' // the shared identity can't see this location (retailer removed us)
  | 'NOT_FOUND' // Google 404: the review (or location) no longer exists. Not a lost-access signal on its own
  | 'TOKEN_REVOKED' // refresh token no longer valid
  | 'UNAVAILABLE'; // 5xx / timeout / network

export class GbpError extends Error {
  constructor(
    public readonly code: GbpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GbpError';
  }
}

// ─── Settings (integration_settings, category GOOGLE) ─────────────

export async function getGbpSetting(key: string): Promise<string | undefined> {
  return getSecret(key);
}

export async function saveGbpSetting(key: string, label: string, value: string): Promise<void> {
  const data = {
    category: 'GOOGLE' as const,
    label,
    encrypted_value: encryptSecret(value),
    masked_preview: maskSecret(value),
    is_active: true,
  };
  await prisma.integrationSetting.upsert({
    where: { key_name: key },
    create: { key_name: key, ...data },
    update: data,
  });
  invalidateSecret(key);
}

/** The platform switch an admin flips once Google approves API access. */
export async function gbpApiApproved(): Promise<boolean> {
  return (await getGbpSetting(GBP_KEYS.approved)) === 'true';
}

export async function gbpConnectedEmail(): Promise<string | null> {
  return (await getGbpSetting(GBP_KEYS.email)) || null;
}

/** What retailers are told to add as Manager: an explicit address, else the connected one. */
export async function gbpManagerEmail(): Promise<string | null> {
  return (await getSecret('GBP_MANAGER_EMAIL')) ?? (await gbpConnectedEmail());
}

async function oauthClient(): Promise<{ id: string; secret: string; redirect: string }> {
  const [id, secret, redirect] = await Promise.all([
    getSecret('GOOGLE_GBP_CLIENT_ID'),
    getSecret('GOOGLE_GBP_CLIENT_SECRET'),
    getSecret('GOOGLE_GBP_REDIRECT_URI'),
  ]);
  if (!id || !secret || !redirect) {
    throw new GbpError('NOT_CONNECTED', 'Google OAuth is not configured');
  }
  return { id, secret, redirect };
}

// ─── OAuth ────────────────────────────────────────────────────────

export async function buildAuthUrl(state: string): Promise<string> {
  const c = await oauthClient();
  const q = new URLSearchParams({
    client_id: c.id,
    redirect_uri: c.redirect,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString());
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** Exchange the consent code. The id_token arrives straight from Google over TLS. */
export async function exchangeCode(
  code: string,
): Promise<{ refreshToken: string; email: string | null }> {
  const c = await oauthClient();
  const res = await post(TOKEN_URL, {
    code,
    client_id: c.id,
    client_secret: c.secret,
    redirect_uri: c.redirect,
    grant_type: 'authorization_code',
  });
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    id_token?: string;
  };
  if (!res.ok || !body.refresh_token) {
    throw new GbpError(
      'TOKEN_REVOKED',
      'Google did not return a refresh token. Try connecting again.',
    );
  }
  return { refreshToken: body.refresh_token, email: decodeIdTokenEmail(body.id_token) };
}

// ─── HTTP ─────────────────────────────────────────────────────────

async function post(url: string, form: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GbpError('UNAVAILABLE', 'Google did not respond');
  }
}

let cached: { token: string; expiresAt: number } | null = null;
export function __resetGbpTokenCache(): void {
  cached = null;
  locationsCache = null;
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const stored = await getGbpSetting(GBP_KEYS.refreshToken);
  if (!stored) throw new GbpError('NOT_CONNECTED', 'No Google account is connected');
  const c = await oauthClient();
  const res = await post(TOKEN_URL, {
    client_id: c.id,
    client_secret: c.secret,
    refresh_token: stored,
    grant_type: 'refresh_token',
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant' || res.status === 400 || res.status === 401) {
      throw new GbpError('TOKEN_REVOKED', 'The Google connection expired. Reconnect it in Admin.');
    }
    throw new GbpError('UNAVAILABLE', 'Google token refresh failed');
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3000) * 1000 };
  return cached.token;
}

type GoogleErr = {
  error?: {
    status?: string;
    message?: string;
    code?: number;
    details?: { reason?: string; metadata?: Record<string, string> }[]; // google.rpc.ErrorInfo
    errors?: { reason?: string }[]; // legacy v4 shape
  };
};

// Order matters: platform-wide causes (API disabled, no approval, bad scope) must be ruled out
// BEFORE a 403/404 is read as "this retailer's location is unreachable", because NEEDS_ACCESS
// flips that one retailer's state and a platform cause would flip all of them.
// ponytail: the quota-0 test (metadata quota_limit_value "0" or "limit 0" in the message) is
// matched from memory of Google's error text; a missed match degrades to UNAVAILABLE (transient,
// retried by the 6-hourly job), never to a wrong per-retailer state.
function classify(status: number, body: GoogleErr): GbpError {
  const e = body.error;
  const s = e?.status;
  const reasons = [...(e?.details ?? []), ...(e?.errors ?? [])].map((d) => d.reason);
  const quotaZero =
    (e?.details ?? []).some((d) => d.metadata?.quota_limit_value === '0') ||
    /\blimit[:\s'"]*0\b(?![.\d])/i.test(e?.message ?? '');
  const rateLimited = status === 429 || s === 'RESOURCE_EXHAUSTED';

  if (
    s === 'SERVICE_DISABLED' ||
    reasons.includes('SERVICE_DISABLED') ||
    (rateLimited && quotaZero)
  ) {
    return new GbpError('NOT_APPROVED', 'Google has not approved Business Profile API access yet');
  }
  if (rateLimited)
    return new GbpError('UNAVAILABLE', 'Google is rate limiting requests. Try again shortly.');
  if (status === 401 || reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    return new GbpError('TOKEN_REVOKED', 'The Google connection expired');
  }
  if (status === 404 || s === 'NOT_FOUND')
    return new GbpError('NOT_FOUND', 'Google could not find it');
  if (s === 'PERMISSION_DENIED' || status === 403) {
    return new GbpError('NEEDS_ACCESS', 'Kanchuki does not have access to this Google profile');
  }
  return new GbpError('UNAVAILABLE', e?.message ?? 'Google request failed');
}

async function call<T>(method: 'GET' | 'PUT', url: string, body?: unknown): Promise<T> {
  const attempts = method === 'GET' ? 2 : 1; // retry 5xx on reads only
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof GbpError) throw err;
      if (i + 1 < attempts) continue;
      throw new GbpError('UNAVAILABLE', 'Google did not respond');
    }
    if (res.ok) return (await res.json().catch(() => ({}))) as T;
    if (res.status >= 500 && i + 1 < attempts) continue;
    if (res.status === 401) cached = null;
    throw classify(res.status, (await res.json().catch(() => ({}))) as GoogleErr);
  }
  throw new GbpError('UNAVAILABLE', 'Google did not respond');
}

// ─── Accounts & locations (admin link tool) ───────────────────────

export type GbpLocation = { account: string; location: string; title: string; address: string };

/** Ids are the trailing segment of Google's resource names ("accounts/123" -> "123"). */
const tail = (name: string) => name.split('/').pop() ?? name;

// Audit #4: the admin picker and the link route each re-walked every account and location, and
// Google's account endpoints have a low per-minute quota. One shared Google identity, so one cache.
// ponytail: per-process, 5 min; a location added or removed in Google shows up within that window.
const LOCATIONS_TTL_MS = 5 * 60_000;
let locationsCache: { at: number; value: GbpLocation[] } | null = null;

async function listAccountNames(): Promise<string[]> {
  const names: string[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ pageSize: '20', ...(pageToken ? { pageToken } : {}) });
    const res = await call<{ accounts?: { name: string }[]; nextPageToken?: string }>(
      'GET',
      `${ACCOUNTS_URL}/accounts?${q.toString()}`,
    );
    for (const a of res.accounts ?? []) names.push(a.name);
    pageToken = res.nextPageToken ?? '';
  } while (pageToken);
  return names;
}

export async function listLocations(): Promise<GbpLocation[]> {
  if (locationsCache && Date.now() - locationsCache.at < LOCATIONS_TTL_MS) {
    return locationsCache.value;
  }
  const value = await fetchLocations();
  locationsCache = { at: Date.now(), value }; // only a complete walk is stored; errors throw above
  return value;
}

async function fetchLocations(): Promise<GbpLocation[]> {
  const out: GbpLocation[] = [];
  for (const accName of await listAccountNames()) {
    const acc = { name: accName };
    let pageToken = '';
    do {
      const q = new URLSearchParams({
        readMask: 'name,title,storefrontAddress',
        pageSize: '100',
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await call<{
        locations?: {
          name: string;
          title?: string;
          storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
        }[];
        nextPageToken?: string;
      }>('GET', `${LOCATIONS_URL}/${acc.name}/locations?${q.toString()}`);
      for (const l of res.locations ?? []) {
        const a = l.storefrontAddress;
        out.push({
          account: tail(acc.name),
          location: tail(l.name),
          title: l.title ?? '',
          address: [...(a?.addressLines ?? []), a?.locality, a?.postalCode]
            .filter(Boolean)
            .join(', '),
        });
      }
      pageToken = res.nextPageToken ?? '';
    } while (pageToken);
  }
  return out;
}

// ─── Reviews ──────────────────────────────────────────────────────

export type GbpReviewData = {
  reviewId: string;
  reviewerName: string | null;
  starRating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  replyComment: string | null;
  replyUpdatedAt: Date | null;
};

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

type RawReview = {
  reviewId?: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

const reviewsUrl = (account: string, location: string) =>
  `${V4}/accounts/${encodeURIComponent(account)}/locations/${encodeURIComponent(location)}/reviews`;

export async function listReviews(
  account: string,
  location: string,
  pageToken?: string,
): Promise<{
  reviews: GbpReviewData[];
  averageRating: number | null;
  totalReviewCount: number | null;
  nextPageToken: string | null;
}> {
  const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
  if (pageToken) q.set('pageToken', pageToken);
  const res = await call<{
    reviews?: RawReview[];
    averageRating?: number;
    totalReviewCount?: number;
    nextPageToken?: string;
  }>('GET', `${reviewsUrl(account, location)}?${q.toString()}`);

  const reviews: GbpReviewData[] = [];
  for (const r of res.reviews ?? []) {
    const stars = STARS[r.starRating ?? ''];
    if (!r.reviewId || !stars || !r.createTime || !r.updateTime) continue; // malformed row: skip, never invent
    reviews.push({
      reviewId: r.reviewId,
      reviewerName: r.reviewer?.displayName ?? null,
      starRating: stars,
      comment: r.comment ?? null,
      createdAt: new Date(r.createTime),
      updatedAt: new Date(r.updateTime),
      replyComment: r.reviewReply?.comment ?? null,
      replyUpdatedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
    });
  }
  return {
    reviews,
    averageRating: res.averageRating ?? null,
    totalReviewCount: res.totalReviewCount ?? null,
    nextPageToken: res.nextPageToken ?? null,
  };
}

/** Create or replace OUR reply to a review. Returns Google's confirmed reply. */
export async function replyToReview(
  account: string,
  location: string,
  reviewId: string,
  comment: string,
): Promise<{ comment: string; updatedAt: Date }> {
  const res = await call<{ comment?: string; updateTime?: string }>(
    'PUT',
    `${reviewsUrl(account, location)}/${encodeURIComponent(reviewId)}/reply`,
    { comment },
  );
  if (!res.comment) throw new GbpError('UNAVAILABLE', 'Google did not confirm the reply');
  return {
    comment: res.comment,
    updatedAt: res.updateTime ? new Date(res.updateTime) : new Date(),
  };
}
