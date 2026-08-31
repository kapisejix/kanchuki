// Shared Shopper Passport helpers — session lookup, cookie handling, phone
// hashing/masking. Extracted from passport.ts (scripts/check-route-size.sh)
// so passport.ts and passport-account.ts share one implementation.
import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { getCurrentNoticeVersion } from '../../lib/notice-versions.js';

// ─── Constants ────────────────────────────────────────────────────

export const COOKIE_NAME = 'kanchuki_passport';
export const SESSION_TTL_DAYS = 180;
export const SESSION_TTL_SEC = SESSION_TTL_DAYS * 24 * 60 * 60;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'kanchuki.com';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
export const CURRENT_NOTICE_VERSION = getCurrentNoticeVersion();

// ─── Session helper ───────────────────────────────────────────────

export function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key!, val.join('=')];
    }),
  );
}

/**
 * Extract and validate the passport session from the request cookie.
 * Returns the session + account, or null if unauthenticated/expired.
 * Slides the session expiry on each valid access.
 */
export async function getPassportSession(cookieHeader: string) {
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;

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

// ─── Helpers ──────────────────────────────────────────────────────

export function phoneHash(phone: string): string {
  return createHash('sha256').update(normalizeIndianPhone(phone)).digest('hex');
}

export function maskPhone(phone: string): string {
  // Show last 4 digits: 9876543210 → 98765-XXXXX
  const normalized = normalizeIndianPhone(phone);
  const last4 = normalized.slice(-4);
  return `XXXXX${last4}`;
}

type CookieReply = { header: (name: string, value: string) => void };

export function setPassportCookie(reply: CookieReply, sessionId: string): void {
  // HttpOnly, Secure, SameSite=Lax, Domain=kanchuki.com — survives Safari ITP.
  // No PII in the cookie — just an opaque session id.
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
    `Path=/`,
  ];
  if (COOKIE_SECURE) parts.push('Secure');
  // Only set Domain in production — dev environments may not be on kanchuki.com
  if (process.env.NODE_ENV === 'production') {
    parts.push(`Domain=${COOKIE_DOMAIN}`);
  }
  reply.header('Set-Cookie', parts.join('; '));
}

export function clearPassportCookie(reply: CookieReply): void {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Path=/'];
  if (COOKIE_SECURE) parts.push('Secure');
  if (process.env.NODE_ENV === 'production') {
    parts.push(`Domain=${COOKIE_DOMAIN}`);
  }
  reply.header('Set-Cookie', parts.join('; '));
}
