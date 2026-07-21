import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../index.js';
import { AppError, validationError } from '../plugins/error-handler.js';

const PhoneSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .transform((v) => normalizeIndianPhone(v)),
});

const OtpVerifySchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .transform((v) => normalizeIndianPhone(v)),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /auth/otp/send ────────────────────────────────────────
  server.post('/otp/send', async (request, reply) => {
    const body = PhoneSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid phone', 'phone');

    const phone = body.data.phone;
    const e164 = `+91${phone}`; // Indian numbers only for MVP

    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: 'sms' },
    });

    if (error) {
      // Don't leak Supabase internals — map to safe messages
      if (error.message.includes('rate')) {
        throw new AppError('RATE_LIMITED', 'Too many OTP requests. Try again in 15 minutes.', 429);
      }
      throw new AppError(
        'OTP_SEND_FAILED',
        'Failed to send OTP. Check phone number and try again.',
        400,
      );
    }

    return reply.status(200).send({
      data: { message: 'OTP sent', phone: `****${phone.slice(-4)}` },
    });
  });

  // ─── POST /auth/otp/verify ──────────────────────────────────────
  server.post('/otp/verify', async (request, reply) => {
    const body = OtpVerifySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid', 'otp');

    const { phone, otp } = body.data;
    const e164 = `+91${phone}`;

    // Verify OTP with Supabase
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      phone: e164,
      token: otp,
      type: 'sms',
    });

    if (authError || !authData.user || !authData.session) {
      throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
    }

    const { user, session } = authData;

    // A marketing agent may have pre-created this retailer in person (see
    // team.ts POST /retailers) before the retailer ever logs in themselves —
    // that row has a placeholder `pending:<id>` auth_user_id since no real
    // Supabase user existed yet. Link it by phone instead of creating a
    // second, duplicate row keyed on the now-real auth_user_id.
    const pending = await prisma.retailer.findUnique({ where: { phone } });
    if (pending?.auth_user_id.startsWith('pending:')) {
      await prisma.retailer.update({ where: { id: pending.id }, data: { auth_user_id: user.id } });
    }

    // Upsert retailer (first login = registration, subsequent = login)
    const retailer = await prisma.retailer.upsert({
      where: { auth_user_id: user.id },
      create: {
        auth_user_id: user.id,
        phone,
        shop_name: '', // filled during onboarding
        city: '',
        plan: 'STARTER',
        plan_status: 'TRIAL',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        onboarding_completed: false,
        onboarding_step: 0,
      },
      update: {}, // existing retailer — no updates on login
      select: {
        id: true,
        phone: true,
        shop_name: true,
        city: true,
        plan: true,
        plan_status: true,
        onboarding_completed: true,
        onboarding_step: true,
      },
    });

    return reply.status(200).send({
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        retailer,
        is_new: retailer.shop_name === '', // no shop name = new retailer
      },
    });
  });

  // ─── POST /auth/refresh ─────────────────────────────────────────
  server.post('/refresh', async (request, reply) => {
    const body = RefreshSchema.safeParse(request.body);
    if (!body.success) throw validationError('Missing refresh_token');

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: body.data.refresh_token,
    });

    if (error || !data.session) {
      throw new AppError('REFRESH_FAILED', 'Session expired. Please log in again.', 401);
    }

    return reply.status(200).send({
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  });

  // ─── DELETE /auth/session (logout) ──────────────────────────────
  server.delete('/session', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Best-effort sign out — don't fail if token already invalid
      await supabase.auth.admin.signOut(token).catch(() => undefined);
    }
    return reply.status(204).send();
  });
};
