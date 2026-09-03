// passport-otp.ts — shopper OTP send/verify + account upsert + session mint (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  isMsg91OtpConfigured,
  sendOtpViaMsg91,
  verifyMsg91WidgetToken,
  verifyStoredOtp,
} from '../../../lib/msg91-otp.js';
import { AppError, validationError } from '../../../plugins/error-handler.js';
import {
  CURRENT_NOTICE_VERSION,
  SESSION_TTL_SEC,
  maskPhone,
  phoneHash,
  setPassportCookie,
} from './passport-helpers.js';

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

export const passportOtpRoutes: FastifyPluginAsync = async (server) => {
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
};
