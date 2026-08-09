import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../index.js';
import { seedDefaultAttributes } from '../lib/default-attributes.js';
import { seedDefaultCategories } from '../lib/default-categories.js';
import { AppError, validationError } from '../plugins/error-handler.js';
import { signTeamToken } from '../plugins/team-auth.js';

const PhoneSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
    .transform((v) => normalizeIndianPhone(v)),
});

const OtpVerifySchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
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

    // ── Staff Login Detection ────────────────────────────────────────
    // Before treating this as a retailer login, check if the phone belongs
    // to a Staff member of an existing retailer. Staff login is scoped to
    // the retailer they belong to (does not create a new Retailer record).
    const staffMember = await prisma.staff.findFirst({
      where: { phone, is_active: true },
      select: {
        id: true,
        name: true,
        role: true,
        retailer_id: true,
        auth_user_id: true,
        retailer: { select: { id: true, shop_name: true, city: true } },
      },
    });

    if (staffMember) {
      // Link the Supabase auth user to this staff member if not already linked
      if (!staffMember.auth_user_id) {
        await prisma.staff.update({
          where: { id: staffMember.id },
          data: { auth_user_id: user.id },
        });
      }

      return reply.status(200).send({
        data: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          is_staff: true,
          staff: {
            id: staffMember.id,
            name: staffMember.name,
            role: staffMember.role,
            retailer_id: staffMember.retailer_id,
            retailer_shop_name: staffMember.retailer.shop_name,
            retailer_city: staffMember.retailer.city,
          },
        },
      });
    }

    // ── TeamMember Login (Kanchuki's own field/sales/support agents) ──
    // 2026-08-04 (auth bridge Option A): the mobile app's only sign-in is
    // phone OTP, but the staff screens under app/staff/* call /team/* routes
    // which require a team JWT. If this phone belongs to an active
    // TeamMember, mint that JWT here so agents can reach the catalog-upload
    // (F-019/F-020) and staff screens from their own phone.
    //
    // SECURITY: the token returned is a TEAM_JWT (signed with
    // TEAM_JWT_SECRET), deliberately NOT the Supabase session token — team
    // routes accept it while every retailer route (Supabase-verified)
    // rejects it, and vice versa, so Staff and TeamMember identities can
    // never cross-authorize each other's routes. The Supabase auth user
    // created by the OTP verify is simply never linked to this TeamMember.
    const teamMember = await prisma.teamMember.findFirst({
      where: { phone, is_active: true },
      select: { id: true, name: true, email: true, role: true },
    });

    if (teamMember) {
      const teamToken = await signTeamToken({ sub: teamMember.id, role: teamMember.role });
      return reply.status(200).send({
        data: {
          access_token: teamToken,
          is_staff: true,
          team_member: {
            id: teamMember.id,
            name: teamMember.name,
            email: teamMember.email,
            role: teamMember.role,
          },
        },
      });
    }

    // ── Retailer Login (existing flow) ───────────────────────────────
    // A marketing agent may have pre-created this retailer in person (see
    // team.ts POST /retailers) before the retailer ever logs in themselves —
    // that row has a placeholder `pending:<id>` auth_user_id since no real
    // Supabase user existed yet. Link it by phone instead of creating a
    // second, duplicate row keyed on the now-real auth_user_id.
    const pending = await prisma.retailer.findUnique({ where: { phone } });
    if (pending) {
      // Soft-deleted account still owns the unique phone. Until the row is
      // purged (admin/SQL-editor path — role separation blocks the app role's
      // DELETE), this number can't be re-registered. Fail with a clean 409
      // instead of letting the upsert below throw an unhandled P2002 → 500
      // (which the mobile app used to show as a misleading "Incorrect OTP").
      if (pending.deleted_at) {
        throw new AppError(
          'ACCOUNT_DELETED',
          'This mobile number is linked to a deleted account. It can be released once the account purge completes — try again later or use a different number.',
          409,
        );
      }
      // Supabase auth user may have been recreated since this retailer last
      // logged in (e.g. auth.users cleanup, or the `pending:` placeholder
      // above) — user.id differs from the row's stored auth_user_id. Relink
      // by phone so the upsert below matches instead of colliding on the
      // unique phone constraint.
      if (pending.auth_user_id !== user.id) {
        await prisma.retailer.update({ where: { id: pending.id }, data: { auth_user_id: user.id } });
      }
    }

    const retailerSelect = {
      id: true,
      phone: true,
      shop_name: true,
      city: true,
      plan: true,
      plan_status: true,
      onboarding_completed: true,
      onboarding_step: true,
      is_suspended: true,
    } as const;

    // Upsert retailer (first login = registration, subsequent = login)
    let retailer;
    try {
      retailer = await prisma.retailer.upsert({
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
        select: retailerSelect,
      });
    } catch (err) {
      // A double-submitted OTP verify (auto-verify-on-6th-digit racing the
      // still-tappable Verify button — see otp.tsx loading guard) can send
      // two concurrent requests for the same brand-new phone. Prisma's
      // upsert only guards the conflict target named in `where`
      // (auth_user_id) — the separate unique `phone` constraint still
      // throws a raw P2002 for the losing request. The winner's row already
      // exists under this same auth_user_id — fetch it instead of 500ing.
      if ((err as { code?: string } | null)?.code === 'P2002') {
        const existing = await prisma.retailer.findUnique({
          where: { auth_user_id: user.id },
          select: retailerSelect,
        });
        if (!existing) throw err;
        retailer = existing;
      } else {
        throw err;
      }
    }

    // F-015: Block suspended retailers from logging in
    if (retailer.is_suspended) {
      throw new AppError(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended. Please contact support for assistance.',
        403,
      );
    }

    // F-024: on signup, seed this retailer's Shop-By-Categories from the
    // admin-editable global template (idempotent — a repeat login while
    // still brand-new just no-ops; a retailer who deleted a default keeps
    // it deleted once shop_name is set).
    if (retailer.shop_name === '') {
      await seedDefaultCategories(retailer.id);
      await seedDefaultAttributes(retailer.id);
    }

    return reply.status(200).send({
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        is_staff: false,
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
