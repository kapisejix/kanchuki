import { randomBytes } from 'node:crypto';
import { type Prisma, prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { Session, User } from '@supabase/supabase-js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../index.js';
import { seedDefaultAttributes } from '../lib/default-attributes.js';
import { seedDefaultCategories } from '../lib/default-categories.js';
import {
  isMsg91OtpConfigured,
  sendOtpViaMsg91,
  verifyMsg91WidgetToken,
  verifyStoredOtp,
} from '../lib/msg91-otp.js';
import { AppError, validationError } from '../plugins/error-handler.js';
import { signTeamToken } from '../plugins/team-auth.js';

const SendOtpSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
    .transform((v) => normalizeIndianPhone(v)),
  // Namespaces the Redis OTP slot per flow — a login OTP and a payment
  // step-up OTP for the same phone never overwrite each other. Defaults to
  // 'login'; step-up flows (checkout) may pass 'stepup'.
  purpose: z.enum(['login', 'stepup']).optional().default('login'),
});

const OtpVerifySchema = z
  .object({
    phone: z
      .string()
      .min(10)
      .max(15)
      .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
      .transform((v) => normalizeIndianPhone(v)),
    // Legacy / web-billing channel: the 6-digit code the user typed. Verified
    // against the Redis entry written by /otp/send (MSG91), or against
    // Supabase when no entry exists (legacy installs/scripts).
    otp: z
      .string()
      .length(6)
      .regex(/^\d{6}$/, 'OTP must be 6 digits')
      .optional(),
    // MSG91 widget channel (mobile app): the access token returned by the
    // SDK's verifyOTP after the widget verified the code client-side. The
    // API re-verifies it with MSG91's Verify Access Token API server-side.
    msg91_token: z.string().min(10, 'msg91_token must be a valid access token').optional(),
    // Must match the purpose passed to /otp/send so verify checks the same
    // Redis slot the code was issued into (see SendOtpSchema).
    purpose: z.enum(['login', 'stepup']).optional().default('login'),
  })
  .refine((d) => d.otp || d.msg91_token, 'Provide an OTP or a verified MSG91 token');

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ─── Supabase session minting for MSG91-verified phones ────────────
// When MSG91 (not Supabase) verifies the OTP, Supabase never saw the code and
// has no session to hand out. GoTrue's admin API can't mint a session
// directly, so: find-or-create the auth user with a server-generated random
// password, then phone+password sign-in to obtain a real session token. The
// password is rotated on every login and never exposed to the app — it is a
// pure session-issuance mechanism.

async function findSupabaseUserByPhone(phone: string) {
  // No admin filter-by-phone in supabase-js — paginate. Kanchuki's auth user
  // count is small at MVP scale, so this is typically a single page.
  // Supabase stores phone without the leading '+' (confirmed via auth logs:
  // signup wrote user_phone "918872101879" for input "+918872101879") — strip
  // it from both sides before comparing (stored data may or may not carry
  // one), or a lookup with only one call (ensureSupabaseSession) misses an
  // existing user and createUser gets retried into a 422 phone_exists.
  const target = phone.replace(/^\+/, '');
  for (let page = 1; page <= 200; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.phone ?? '').replace(/^\+/, '') === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null; // last page
  }
  return null;
}

function sessionIssuanceError() {
  return new AppError('OTP_VERIFY_FAILED', 'Could not complete sign-in. Please try again.', 500);
}

// ─── TEST BYPASS (pre-production only) ─────────────────────────────
// With OTP_TEST_BYPASS=1, phones listed in OTP_TEST_PHONES skip the real
// MSG91 OTP send + verify entirely — any 6-digit code the tester types is
// accepted. Lets a solo dev demo the app to retailers/team/photographers on
// dummy numbers without owning 12-21 real SIMs, and without depending on
// MSG91's DLT-registered SMS delivery.
//
// OTP_TEST_PHONES is a comma-separated list of bare 10-digit numbers, e.g.
// "9000000001,9000000002,...". Flag OFF (production default) never engages
// the bypass — unset OTP_TEST_BYPASS once real users are live; the same
// phones then flow through the real OTP path with no data migration
// (ensureSupabaseSession already find-or-creates the auth user).
const DEFAULT_TEST_PHONES = new Set([
  '9000000001',
  '9000000002',
  '9000000003',
  '9000000004',
  '9000000005',
  '9999999999',
  '9876543210',
]);

function otpTestPhones(): Set<string> {
  const envVal = process.env.OTP_TEST_PHONES;
  if (envVal !== undefined && envVal !== '') {
    const custom = envVal
      .replace(/[\[\]"']/g, '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        try {
          return normalizeIndianPhone(p);
        } catch {
          return p.replace(/\D/g, '').slice(-10);
        }
      })
      .filter((p) => p.length === 10);

    return new Set(custom);
  }

  return DEFAULT_TEST_PHONES;
}

function otpTestBypassActive(phone: string): boolean {
  if (process.env.OTP_TEST_BYPASS !== '1') return false;
  const normalized = phone.replace(/\D/g, '').slice(-10);
  if ((process.env.OTP_TEST_PHONES ?? '').includes('*')) return true;
  return otpTestPhones().has(normalized);
}

async function ensureSupabaseSession(phone: string): Promise<{ user: User; session: Session }> {
  const e164 = `+91${phone}`;
  const password = randomBytes(24).toString('base64url');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await findSupabaseUserByPhone(e164);
    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
      if (error) {
        // biome-ignore lint/suspicious/noConsoleLog: operator-facing diagnostics
        console.error(`[auth] ensureSupabaseSession: updateUserById failed for ${e164}:`, error.message);
        throw sessionIssuanceError();
      }
    } else {
      const { error } = await supabase.auth.admin.createUser({
        phone: e164,
        password,
        phone_confirm: true,
      });
      if (error) {
        if (attempt === 0 && /already/i.test(error.message ?? '')) continue;
        // biome-ignore lint/suspicious/noConsoleLog: operator-facing diagnostics
        console.error(`[auth] ensureSupabaseSession: createUser failed for ${e164}:`, error.message);
        throw sessionIssuanceError();
      }
    }
    break;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ phone: e164, password });
  if (error || !data.session || !data.user) {
    // biome-ignore lint/suspicious/noConsoleLog: operator-facing diagnostics
    console.error(`[auth] ensureSupabaseSession: signInWithPassword failed for ${e164}:`, error?.message);
    throw sessionIssuanceError();
  }
  return { user: data.user, session: data.session };
}

export const authRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /auth/otp/send ────────────────────────────────────────
  server.post('/otp/send', async (request, reply) => {
    const body = SendOtpSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid phone', 'phone');

    const phone = body.data.phone;
    const e164 = `+91${phone}`; // Indian numbers only for MVP

    if (otpTestBypassActive(phone)) {
      // TEST BYPASS: whitelisted phone — no MSG91 call, no DLT-dropped SMS.
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/send phone=${phone} path=test-bypass`);
      return reply.status(200).send({
        data: { message: 'OTP sent', phone: `****${phone.slice(-4)}`, bypass: true },
      });
    }

    if (isMsg91OtpConfigured()) {
      // Real OTP configuration: MSG91 generates + sends the SMS directly and
      // the API stores the code in Redis for server-side verification.
      // sendOtpViaMsg91 throws 429 RATE_LIMITED / 400 OTP_SEND_FAILED.
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/send phone=${phone} path=msg91 purpose=${body.data.purpose}`);
      await sendOtpViaMsg91(phone, body.data.purpose);
      // NOTE: we do NOT also send via Supabase here. Supabase generates a
      // DIFFERENT random OTP, so if the user enters the MSG91 OTP and Redis
      // returns 'absent' (expired/TTL), falling to Supabase verifyOtp would
      // check against the wrong code and always fail.
    } else {
      // Legacy Supabase path — only used in environments without MSG91 keys
      // on the API (local dev). The Supabase send-sms-hook Edge Function is
      // the SMS carrier there.
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/send phone=${phone} path=supabase`);
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms' },
      });

      if (error) {
        // Don't leak Supabase internals — map to safe messages
        if (error.message.includes('rate')) {
          throw new AppError(
            'RATE_LIMITED',
            'Too many OTP requests. Try again in 15 minutes.',
            429,
          );
        }
        throw new AppError(
          'OTP_SEND_FAILED',
          'Failed to send OTP. Check phone number and try again.',
          400,
        );
      }
    }

    return reply.status(200).send({
      data: { message: 'OTP sent', phone: `****${phone.slice(-4)}` },
    });
  });

  // ─── POST /auth/otp/verify ──────────────────────────────────────
  server.post('/otp/verify', async (request, reply) => {
    const body = OtpVerifySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid', 'otp');

    const { phone, otp, msg91_token, purpose } = body.data;
    const e164 = `+91${phone}`;

    // ── 1. Verify the OTP (three channels, all server-side) ──────────
    //  - msg91_token: the widget verified the code client-side; re-confirm the
    //    access token with MSG91 before trusting it.
    //  - otp + Redis entry: /otp/send issued this OTP via MSG91; check the
    //    stored code (one-time use).
    //  - otp without a Redis entry ('absent'): falls through to Supabase
    //    verification (legacy path for local dev / environments without MSG91).
    let user: User;
    let session: Session;
    let msg91Verified = false;
    const bypassActive = otpTestBypassActive(phone);

    if (bypassActive) {
      // TEST BYPASS: any code the tester types is accepted.
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/verify phone=${phone} path=test-bypass`);
      msg91Verified = true;
    } else if (msg91_token) {
      await verifyMsg91WidgetToken(msg91_token, phone); // throws 401 on failure
      msg91Verified = true;
    } else if (otp) {
      const result = await verifyStoredOtp(phone, otp, purpose);
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/verify phone=${phone} storedOtpResult=${result} msg91Configured=${isMsg91OtpConfigured()}`);
      if (result === 'verified') {
        msg91Verified = true;
      } else if (result === 'invalid' || result === 'locked') {
        throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
      } else if (isMsg91OtpConfigured()) {
        // 'absent' with MSG91 configured means the Redis entry expired or was
        // never stored. Falling to Supabase verifyOtp would check against a
        // DIFFERENT random OTP (Supabase's own) and always fail. Throw a
        // clear error so the operator knows to re-send.
        throw new AppError(
          'OTP_EXPIRED',
          'OTP has expired or was not found. Please request a new one.',
          401,
        );
      }
      // 'absent' WITHOUT MSG91 configured: legacy Supabase path (local dev).
      // Fall through to supabase.auth.verifyOtp below.
    }

    if (msg91Verified) {
      // MSG91 verified the phone — mint a Supabase session for it (see
      // ensureSupabaseSession: find-or-create the auth user with a rotated
      // random password, then phone+password sign-in to obtain a session).
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/verify phone=${phone} msg91Verified=true → minting Supabase session`);
      const created = await ensureSupabaseSession(phone);
      user = created.user;
      session = created.session;
    } else {
      // Legacy: verify the OTP with Supabase (auto-creates the auth user).
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing OTP diagnostics
      console.log(`[auth] /otp/verify phone=${phone} falling through to Supabase verifyOtp`);
      const { data: authData, error: authError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp ?? '',
        type: 'sms',
      });

      if (authError || !authData.user || !authData.session) {
        throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
      }
      user = authData.user;
      session = authData.session;
    }

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
    let pending = await prisma.retailer.findUnique({ where: { phone } });
    if (pending?.deleted_at && bypassActive) {
      // TEST BYPASS: revive a soft-deleted account instead of 409-ing —
      // testers commonly reuse the same dummy numbers across sessions.
      await prisma.retailer.update({
        where: { id: pending.id },
        data: { deleted_at: null, auth_user_id: user.id },
      });
      pending = await prisma.retailer.findUnique({ where: { phone } });
    }
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
        await prisma.retailer.update({
          where: { id: pending.id },
          data: { auth_user_id: user.id },
        });
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
    let retailer: Prisma.RetailerGetPayload<{ select: typeof retailerSelect }>;
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

    // F-015: a suspension must also stop token refresh, not just fresh login —
    // otherwise a suspended retailer stays logged in indefinitely by refreshing.
    const authUserId = data.session.user.id;
    const [suspendedRetailer, suspendedStaff] = await Promise.all([
      prisma.retailer.findUnique({
        where: { auth_user_id: authUserId },
        select: { is_suspended: true },
      }),
      prisma.staff.findFirst({
        where: { auth_user_id: authUserId, is_active: true },
        select: { retailer: { select: { is_suspended: true } } },
      }),
    ]);
    if (suspendedRetailer?.is_suspended || suspendedStaff?.retailer.is_suspended) {
      await supabase.auth.admin.signOut(data.session.access_token).catch(() => undefined);
      throw new AppError(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended. Please contact support for assistance.',
        403,
      );
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
