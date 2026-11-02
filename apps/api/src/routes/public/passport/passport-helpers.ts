import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { getCurrentNoticeVersion } from '../../../lib/notice-versions.js';

// Shared helpers/constants for the passport route modules (split from
// passport.ts — module-level code moved verbatim by
// scripts/_tmp-split-route-modules.cjs).

// ─── Constants ────────────────────────────────────────────────────

export const COOKIE_NAME = 'kanchuki_passport';
// Not exported — SESSION_TTL_SEC (its only consumer) derives from it.
const SESSION_TTL_DAYS = 180;
export const SESSION_TTL_SEC = SESSION_TTL_DAYS * 24 * 60 * 60;
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'kanchuki.app';
export const COOKIE_SECURE = process.env.NODE_ENV === 'production';
export const CURRENT_NOTICE_VERSION = getCurrentNoticeVersion();

// ─── Session helper ───────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key ?? '', val.join('=')];
    }),
  );
}

/**
 * The raw passport session id in a Cookie header, parsed exactly as getPassportSession
 * parses it (last duplicate wins). Anything that keys on "the session" without
 * authenticating it — e.g. a rate limit — must use this, never its own regex, or a request
 * carrying two cookies can be keyed on one value and authenticated as the other.
 */
export function passportCookieId(cookieHeader: string): string | undefined {
  return parseCookies(cookieHeader)[COOKIE_NAME] || undefined;
}

/**
 * The DB key for a cookie value. The cookie is a bearer secret, so only its SHA-256 is stored in
 * `passport_sessions.id` — a leaked row, backup or log line cannot be pasted back as a cookie
 * (H4-7, RC-154). Every read and write of that column goes through this.
 */
export const hashSessionId = (cookieId: string): string =>
  createHash('sha256').update(cookieId).digest('hex');

/**
 * Extract and validate the passport session from the request cookie.
 * Returns the session + account, or null if unauthenticated/expired.
 * Slides the session expiry on each valid access.
 */
export async function getPassportSession(cookieHeader: string) {
  const cookies = parseCookies(cookieHeader);
  const cookieId = cookies[COOKIE_NAME];
  if (!cookieId) return null;
  const sessionId = hashSessionId(cookieId);

  const session = await prisma.passportSession.findUnique({
    where: { id: sessionId },
    include: { customer_account: true },
  });

  if (!session || session.revoked_at) return null;
  if (session.expires_at < new Date()) {
    await prisma.passportSession.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }

  // Slide expiry on each access
  await prisma.passportSession.update({
    where: { id: sessionId },
    data: {
      last_seen_at: new Date(),
      expires_at: new Date(Date.now() + SESSION_TTL_SEC * 1000),
    },
  });

  return session;
}

/**
 * A rate-limit bucket id for a cookie, or null unless it maps to a live session. Read-only (no
 * sliding, no delete), so it is safe in a keyGenerator that runs before the handler. Lives here
 * because only this file may touch passport_sessions (RC-154 guard).
 */
export async function verifiedSessionKey(cookieId: string): Promise<string | null> {
  const row = await prisma.passportSession.findUnique({
    where: { id: hashSessionId(cookieId) },
    select: { id: true, revoked_at: true, expires_at: true },
  });
  if (!row || row.revoked_at || row.expires_at < new Date()) return null;
  return row.id;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** product id → owning retailer id. H4-5/RC-095: never trust a client retailer_id. */
export async function productRetailerMap(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, deleted_at: null },
    select: { id: true, retailer_id: true },
  });
  return new Map(rows.map((p) => [p.id, p.retailer_id]));
}

export function phoneHash(phone: string): string {
  return createHash('sha256').update(normalizeIndianPhone(phone)).digest('hex');
}

export function maskPhone(phone: string): string {
  // Show last 4 digits: 9876543210 → 98765-XXXXX
  const normalized = normalizeIndianPhone(phone);
  const last4 = normalized.slice(-4);
  return `XXXXX${last4}`;
}

export function setPassportCookie(
  reply: { header: (name: string, value: string) => void },
  sessionId: string,
): void {
  // HttpOnly, Secure, SameSite=Lax, Domain=kanchuki.app — survives Safari ITP.
  // No PII in the cookie — just an opaque session id.
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
    'Path=/',
  ];
  if (COOKIE_SECURE) parts.push('Secure');
  // Only set Domain in production — dev environments may not be on kanchuki.com
  if (process.env.NODE_ENV === 'production') {
    parts.push(`Domain=${COOKIE_DOMAIN}`);
  }
  reply.header('Set-Cookie', parts.join('; '));
}
