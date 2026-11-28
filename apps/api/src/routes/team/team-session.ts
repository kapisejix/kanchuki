import { randomInt } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { sendEmail, sendTeamPasswordResetEmail } from '../../lib/email.js';
import {
  awaitRedisReady,
  isMsg91OtpConfigured,
  otpTestBypassActive,
  sendOtpViaMsg91,
  verifyStoredOtp,
} from '../../lib/msg91-otp.js';
import {
  AppError,
  forbidden,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';
import { hashPassword, signTeamToken, verifyPassword } from '../../plugins/team-auth.js';
import { teamAuthPreHandler } from './team-helpers.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const SendOtpSchema = z.object({
  identifier: z.string().min(3).max(100),
});

const VerifyOtpSchema = z.object({
  identifier: z.string().min(3).max(100),
  otp: z.string().min(4).max(8),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  reset_code: z.string().min(4).max(8),
  new_password: z.string().min(8).max(128),
});

let sessionRedis: Redis | null = null;
function getSessionRedis(): Redis {
  sessionRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return sessionRedis;
}

// RC-085: codes fail closed. A Redis error (including the first command on the
// lazily built client, which runs before 'ready' with the offline queue off)
// means the code cannot be checked — never a dev default like '123456'.
async function storeTeamCode(key: string, code: string, ttlSec: number): Promise<void> {
  const redis = getSessionRedis();
  await awaitRedisReady(redis);
  await redis.set(key, code, 'EX', ttlSec);
}

async function consumeTeamCode(key: string): Promise<string | null> {
  try {
    const redis = getSessionRedis();
    await awaitRedisReady(redis);
    return await redis.getdel(key);
  } catch {
    return null;
  }
}

// A SUPER_ADMIN/ADMIN team token is an admin session, so these routes get the
// same per-IP limit as /admin/login (S-003). Password login also has a per-email
// lock, since one attacker can still rotate real IPs (trustProxy hop fix: T2.5 F1).
const TEAM_AUTH_RATE_LIMIT = { config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } } };
const TEAM_CODE_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: 15 * 60 * 1000 } } };
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_SEC = 15 * 60;
const loginFailKey = (email: string) => `team:login-fail:${email}`;

// ponytail: counter errors fail open — the per-route limit still applies, and
// failing closed would lock every team member out during a Redis outage.
async function loginFailures(email: string): Promise<number> {
  try {
    const redis = getSessionRedis();
    await awaitRedisReady(redis);
    return Number(await redis.get(loginFailKey(email))) || 0;
  } catch {
    return 0;
  }
}

async function recordLoginFailure(email: string): Promise<void> {
  try {
    const redis = getSessionRedis();
    await awaitRedisReady(redis);
    const count = await redis.incr(loginFailKey(email));
    if (count === 1) await redis.expire(loginFailKey(email), LOGIN_LOCK_SEC);
  } catch {
    // see loginFailures
  }
}

export const teamSessionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ─── POST /team/login (Password Login) ───────────────────────────
  server.post('/login', TEAM_AUTH_RATE_LIMIT, async (request) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid credentials');

    const email = body.data.email.toLowerCase();
    if ((await loginFailures(email)) >= LOGIN_MAX_FAILURES) {
      throw new AppError('RATE_LIMITED', 'Too many failed attempts. Try again in 15 minutes.', 429);
    }

    const member = await prisma.teamMember.findUnique({ where: { email } });
    if (!member || !member.is_active || !verifyPassword(body.data.password, member.password_hash)) {
      await recordLoginFailure(email);
      throw forbidden('Invalid credentials');
    }
    await consumeTeamCode(loginFailKey(email)); // reset the counter on success

    const token = await signTeamToken({ sub: member.id, role: member.role });
    return {
      data: {
        token,
        team_member: {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          referral_code: member.referral_code,
        },
      },
    };
  });

  // ─── POST /team/otp/send (Send OTP via Phone or Email) ───────────
  server.post('/otp/send', TEAM_AUTH_RATE_LIMIT, async (request) => {
    const body = SendOtpSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid phone or email', 'identifier');

    const raw = body.data.identifier.trim();
    const isPhone = isValidIndianPhone(raw) || /^\d{10}$/.test(raw.replace(/\D/g, ''));
    const normalizedPhone = isPhone
      ? normalizeIndianPhone(raw.replace(/\D/g, '').slice(-10))
      : null;
    const normalizedEmail = !isPhone && raw.includes('@') ? raw.toLowerCase() : null;

    if (!normalizedPhone && !normalizedEmail) {
      throw validationError(
        'Please enter a valid 10-digit mobile number or email address',
        'identifier',
      );
    }

    const member = await prisma.teamMember.findFirst({
      where: {
        is_active: true,
        OR: [
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
    });

    if (!member) {
      throw validationError(
        'No active team member found with this mobile number or email',
        'identifier',
      );
    }

    // If member has a phone number matching or configured, send SMS/WhatsApp OTP
    if (normalizedPhone && member.phone) {
      if (otpTestBypassActive(member.phone)) {
        return {
          data: {
            message: 'OTP sent (test bypass)',
            type: 'phone',
            destination: `****${member.phone.slice(-4)}`,
          },
        };
      }

      if (isMsg91OtpConfigured()) {
        await sendOtpViaMsg91(member.phone, 'login');
      } else {
        // Fallback for dev / environments without MSG91 keys
        const code = randomInt(100_000, 1_000_000).toString();
        await storeTeamCode(`team:otp:${member.phone}`, code, 600).catch(() => {
          throw serviceUnavailable('Could not start a secure OTP session. Try again.');
        });
      }

      return {
        data: {
          message: 'OTP sent to your registered mobile number',
          type: 'phone',
          destination: `****${member.phone.slice(-4)}`,
        },
      };
    }

    // Email OTP flow
    const code = randomInt(100_000, 1_000_000).toString();
    await storeTeamCode(`team:email-otp:${member.email}`, code, 600).catch(() => {
      throw serviceUnavailable('Could not start a secure OTP session. Try again.');
    });

    await sendEmail({
      to: member.email,
      subject: 'Kanchuki Team Login — Your OTP Code',
      html: `
        <div style="font-family: sans-serif; background-color: #030712; color: #f3f4f6; padding: 24px; border-radius: 12px; max-width: 450px;">
          <h2 style="color: #22d3ee; margin-top: 0;">Team Member Login</h2>
          <p>Hello ${member.name}, here is your one-time sign-in code:</p>
          <div style="background-color: #1f2937; padding: 16px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #22d3ee;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        </div>
      `,
      text: `Hello ${member.name},\n\nYour Kanchuki Team login code is: ${code}\n\nValid for 10 minutes.\n`,
    });

    return {
      data: {
        message: 'OTP sent to your email address',
        type: 'email',
        destination: member.email,
      },
    };
  });

  // ─── POST /team/otp/verify (Verify OTP & Mint Team JWT) ──────────
  server.post('/otp/verify', TEAM_CODE_RATE_LIMIT, async (request) => {
    const body = VerifyOtpSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid OTP code or identifier');

    const raw = body.data.identifier.trim();
    const otp = body.data.otp.trim();
    const isPhone = isValidIndianPhone(raw) || /^\d{10}$/.test(raw.replace(/\D/g, ''));
    const normalizedPhone = isPhone
      ? normalizeIndianPhone(raw.replace(/\D/g, '').slice(-10))
      : null;
    const normalizedEmail = !isPhone && raw.includes('@') ? raw.toLowerCase() : null;

    const member = await prisma.teamMember.findFirst({
      where: {
        is_active: true,
        OR: [
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
    });

    if (!member) {
      throw validationError('No active team member found', 'identifier');
    }

    let verified = false;

    // Test bypass check
    if (member.phone && otpTestBypassActive(member.phone)) {
      verified = true;
    } else if (normalizedPhone && member.phone) {
      if (isMsg91OtpConfigured()) {
        const res = await verifyStoredOtp(member.phone, otp, 'login');
        if (res === 'verified') verified = true;
      } else {
        const stored = await consumeTeamCode(`team:otp:${member.phone}`);
        if (stored !== null && stored === otp) verified = true;
      }
    } else if (normalizedEmail || member.email) {
      const stored = await consumeTeamCode(`team:email-otp:${member.email}`);
      if (stored !== null && stored === otp) verified = true;
    }

    if (!verified) {
      throw forbidden('Invalid or expired OTP code');
    }

    const token = await signTeamToken({ sub: member.id, role: member.role });
    return {
      data: {
        token,
        team_member: {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          referral_code: member.referral_code,
        },
      },
    };
  });

  // ─── POST /team/forgot-password ──────────────────────────────────
  server.post('/forgot-password', TEAM_AUTH_RATE_LIMIT, async (request) => {
    const body = ForgotPasswordSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid email address', 'email');

    const member = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });

    if (member?.is_active) {
      const resetCode = randomInt(100_000, 1_000_000).toString();
      // Same response whether or not the store worked (no account
      // enumeration), but never email a code that can't be verified.
      const stored = await storeTeamCode(`team:pwd-reset:${member.email}`, resetCode, 900) // 15 min
        .then(() => true)
        .catch((err) => {
          request.log.error({ err }, 'team forgot-password: reset code store failed');
          return false;
        });

      if (stored) {
        await sendTeamPasswordResetEmail({
          name: member.name,
          email: member.email,
          resetCode,
        });
      }
    }

    return {
      data: {
        message:
          'If an active account exists with this email, a password reset code has been sent.',
      },
    };
  });

  // ─── POST /team/reset-password ───────────────────────────────────
  server.post('/reset-password', TEAM_CODE_RATE_LIMIT, async (request) => {
    const body = ResetPasswordSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid input');

    const email = body.data.email.toLowerCase();
    const member = await prisma.teamMember.findUnique({
      where: { email },
    });

    if (!member || !member.is_active) {
      throw validationError('Invalid or expired reset code', 'reset_code');
    }

    const stored = await consumeTeamCode(`team:pwd-reset:${member.email}`);
    if (stored === null || stored !== body.data.reset_code) {
      throw validationError(
        'Invalid or expired reset code. Please request a new code.',
        'reset_code',
      );
    }

    await prisma.teamMember.update({
      where: { id: member.id },
      data: { password_hash: hashPassword(body.data.new_password) },
    });

    return {
      data: {
        message: 'Password reset successfully. You can now log in with your new password.',
      },
    };
  });

  // ─── GET /team/me ────────────────────────────────────────────────
  server.get('/me', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    if (tm.id === 'admin-key') {
      return { data: { id: 'admin-key', name: 'Admin', role: 'SUPER_ADMIN', territories: [] } };
    }
    const member = await prisma.teamMember.findUnique({
      where: { id: tm.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        max_retailers: true,
        referral_code: true,
      },
    });
    if (!member) throw notFound('Team member');
    const territories = await prisma.territory.findMany({
      where: { id: { in: tm.territoryIds } },
      select: { id: true, name: true, level: true },
    });
    return { data: { ...member, territories } };
  });
};
