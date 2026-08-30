// Shopper Passport — OTP send/verify routes (Task 2 + Task 3).
//
// Two verification channels, both backed by the existing msg91-otp.ts lib:
//   1. MSG91 web widget: the client loads the widget, sends OTP, verifies
//      the code client-side, and hands back the JWT access token. The API
//      re-verifies it server-side with verifyMsg91WidgetToken().
//   2. SMS fallback: the API generates + stores + sends the OTP via
//      sendOtpViaMsg91(), and verifies against the Redis entry.
//
// On successful verification: upsert CustomerAccount, mint a passport
// session (Task 3 — HttpOnly cookie), return { ok, account_id, is_new }.

import { randomBytes, createHash } from 'node:crypto';
import { prisma, type Prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  isMsg91OtpConfigured,
  sendOtpViaMsg91,
  verifyMsg91WidgetToken,
  verifyStoredOtp,
} from '../../lib/msg91-otp.js';
import { AppError, validationError } from '../../plugins/error-handler.js';

// ─── Session helper ───────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
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
async function getPassportSession(cookieHeader: string) {
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

// ─── Constants ────────────────────────────────────────────────────

const COOKIE_NAME = 'kanchuki_passport';
const SESSION_TTL_DAYS = 180;
const SESSION_TTL_SEC = SESSION_TTL_DAYS * 24 * 60 * 60;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'kanchuki.com';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const CURRENT_NOTICE_VERSION = '1.0';

// ─── Schemas ──────────────────────────────────────────────────────

const SendOtpSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
    .transform((v) => normalizeIndianPhone(v)),
});

const VerifyOtpSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
    .transform((v) => normalizeIndianPhone(v)),
  // Channel 1: MSG91 widget JWT access token (web/mobile widget flow)
  widget_token: z.string().optional(),
  // Channel 2: 6-digit OTP code (SMS fallback flow)
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'OTP must be 6 digits')
    .optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────

function phoneHash(phone: string): string {
  return createHash('sha256').update(normalizeIndianPhone(phone)).digest('hex');
}

function maskPhone(phone: string): string {
  // Show last 4 digits: 9876543210 → 98765-XXXXX
  const normalized = normalizeIndianPhone(phone);
  const last4 = normalized.slice(-4);
  return `XXXXX${last4}`;
}

function setPassportCookie(
  reply: { header: (name: string, value: string) => void },
  sessionId: string,
): void {
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

// ─── Routes ───────────────────────────────────────────────────────

export const passportRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /passport/otp/send ───────────────────────────────────
  // SMS fallback path: generates + stores + sends a 6-digit OTP via MSG91.
  // The widget path skips this entirely (the widget sends OTP client-side).
  // Reuses the existing sendOtpViaMsg91() + its per-phone cooldown.
  server.post('/otp/send', async (request, reply) => {
    const body = SendOtpSchema.parse(request.body);
    const phone = body.phone;

    if (!isMsg91OtpConfigured()) {
      throw new AppError(
        'OTP_SEND_FAILED',
        'OTP service is not configured. Please try again later.',
        503,
      );
    }

    const masked = await sendOtpViaMsg91(phone, 'login');
    return reply.status(200).send({ ok: true, masked_phone: masked });
  });

  // ─── POST /passport/otp/verify ─────────────────────────────────
  // Verifies the OTP (widget JWT or SMS code), creates/returns CustomerAccount,
  // mints a passport session cookie.
  server.post('/otp/verify', async (request, reply) => {
    const body = VerifyOtpSchema.parse(request.body);
    const { phone } = body;

    // Must provide exactly one of widget_token or otp
    if (!body.widget_token && !body.otp) {
      throw validationError('Provide either widget_token or otp');
    }
    if (body.widget_token && body.otp) {
      throw validationError('Provide only one of widget_token or otp');
    }

    // ── Verify the OTP ──
    if (body.widget_token) {
      // Channel 1: MSG91 widget — server-side re-verification
      await verifyMsg91WidgetToken(body.widget_token, phone);
      // verifyMsg91WidgetToken throws 401 on failure — never reaches here if invalid
    } else {
      // Channel 2: SMS fallback — verify against Redis entry
      const result = await verifyStoredOtp(phone, body.otp!, 'login');
      if (result === 'absent') {
        throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
      }
      if (result === 'invalid') {
        throw new AppError('INVALID_OTP', 'Incorrect OTP. Please try again.', 401);
      }
      if (result === 'locked') {
        throw new AppError('OTP_LOCKED', 'Too many attempts. Please request a new OTP.', 429);
      }
      // result === 'verified' — code consumed atomically via GETDEL
    }

    // ── Upsert CustomerAccount ──
    const hash = phoneHash(phone);
    const existingAccount = await prisma.customerAccount.findUnique({
      where: { phone_hash: hash },
    });

    let account: { id: string; name: string | null; phone: string };
    let isNew = false;

    if (existingAccount) {
      account = existingAccount;
      // Update last verification time
      await prisma.customerAccount.update({
        where: { id: existingAccount.id },
        data: { is_verified: true, updated_at: new Date() },
      });
    } else {
      isNew = true;
      account = await prisma.customerAccount.create({
        data: {
          phone,
          phone_hash: hash,
          is_verified: true,
        },
      });

      // Write ConsentEvent for passport creation
      await prisma.consentEvent.create({
        data: {
          customer_account_id: account.id,
          kind: 'PASSPORT_CREATED',
          notice_version: CURRENT_NOTICE_VERSION,
          ip_hash: createHash('sha256')
            .update((request.ip as string) || 'unknown')
            .digest('hex'),
          user_agent: request.headers['user-agent'] || null,
        },
      });
    }

    // ── Mint session (Task 3) ──
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000);

    await prisma.passportSession.create({
      data: {
        id: sessionId,
        customer_account_id: account.id,
        expires_at: expiresAt,
        user_agent: request.headers['user-agent'] || null,
        ip_hash: createHash('sha256')
          .update((request.ip as string) || 'unknown')
          .digest('hex'),
      },
    });

    // Set the HttpOnly cookie
    setPassportCookie(reply, sessionId);

    return reply.status(200).send({
      ok: true,
      account_id: account.id,
      is_new: isNew,
      name: account.name,
      phone_masked: maskPhone(phone),
    });
  });

  // ─── GET /passport/me ──────────────────────────────────────────
  // Returns the current passport session info. Used by ContactGate
  // to determine returning vs first-time shopper.
  server.get('/me', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const acct = session.customer_account;
    return reply.status(200).send({
      account: {
        id: acct.id,
        name: acct.name,
        phone_masked: maskPhone(acct.phone),
        usual_size: acct.usual_size,
        city: acct.city,
      },
    });
  });

  // ─── GET /passport/stores ──────────────────────────────────────
  // List stores the shopper has visited. Number always masked.
  server.get('/stores', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const visits = await prisma.customerStoreVisit.findMany({
      where: { customer_account_id: session.customer_account_id },
      include: {
        retailer: {
          select: { id: true, shop_name: true, city: true, logo_url: true },
        },
      },
      orderBy: { last_visited_at: 'desc' },
    });

    return reply.status(200).send({
      stores: visits.map((v) => ({
        retailer: v.retailer,
        first_visited_at: v.first_visited_at,
        last_visited_at: v.last_visited_at,
        visit_count: v.visit_count,
        is_muted: v.is_muted,
        contact_shared: v.contact_shared,
      })),
    });
  });

  // ─── POST /passport/stores/:retailerId/mute ────────────────────
  // Toggle mute for a store. Muted stores are skipped in WhatsApp sends.
  server.post('/stores/:retailerId/mute', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const { retailerId } = request.params as { retailerId: string };

    const visit = await prisma.customerStoreVisit.findUnique({
      where: { customer_account_id_retailer_id: { customer_account_id: session.customer_account_id, retailer_id: retailerId } },
    });
    if (!visit) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    }

    const newMuted = !visit.is_muted;
    await prisma.customerStoreVisit.update({
      where: { id: visit.id },
      data: { is_muted: newMuted },
    });

    // Write ConsentEvent
    await prisma.consentEvent.create({
      data: {
        customer_account_id: session.customer_account_id,
        retailer_id: retailerId,
        kind: newMuted ? 'STORE_MUTED' : 'STORE_UNMUTED',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    return reply.status(200).send({ ok: true, is_muted: newMuted });
  });

  // ─── POST /passport/stores/:retailerId/remove ──────────────────
  // Remove contact from a store. Soft-deletes the Customer row,
  // keeps the visit history with contact_shared=false.
  server.post('/stores/:retailerId/remove', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const { retailerId } = request.params as { retailerId: string };

    const visit = await prisma.customerStoreVisit.findUnique({
      where: { customer_account_id_retailer_id: { customer_account_id: session.customer_account_id, retailer_id: retailerId } },
    });
    if (!visit) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    }

    // Soft-delete the retailer-scoped Customer row for this account
    const account = session.customer_account;
    const normalizedPhone = normalizeIndianPhone(account.phone);
    await prisma.customer.updateMany({
      where: {
        retailer_id: retailerId,
        phone: normalizedPhone,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });

    // Update visit to reflect withdrawal
    await prisma.customerStoreVisit.update({
      where: { id: visit.id },
      data: {
        contact_shared: false,
        whatsapp_consent: false,
        whatsapp_consent_at: null,
      },
    });

    // Write ConsentEvent
    await prisma.consentEvent.create({
      data: {
        customer_account_id: session.customer_account_id,
        retailer_id: retailerId,
        kind: 'STORE_CONSENT_WITHDRAWN',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    return reply.status(200).send({ ok: true });
  });

  // ─── POST /passport/logout ─────────────────────────────────────
  // Revokes the current session and clears the cookie.
  server.post('/logout', async (request, reply) => {
    const cookieHeader = request.headers.cookie || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key!, val.join('=')];
      }),
    );
    const sessionId = cookies[COOKIE_NAME];

    if (sessionId) {
      await prisma.passportSession.updateMany({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }

    // Clear the cookie
    const parts = [
      `${COOKIE_NAME}=`,
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
      'Path=/',
    ];
    if (COOKIE_SECURE) parts.push('Secure');
    if (process.env.NODE_ENV === 'production') {
      parts.push(`Domain=${COOKIE_DOMAIN}`);
    }
    reply.header('Set-Cookie', parts.join('; '));

    return reply.status(200).send({ ok: true });
  });
};
