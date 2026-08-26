import { randomInt } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { sendEmail, sendTeamPasswordResetEmail } from '../../lib/email.js';
import {
  isMsg91OtpConfigured,
  sendOtpViaMsg91,
  verifyStoredOtp,
} from '../../lib/msg91-otp.js';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { hashPassword, signTeamToken, verifyPassword } from '../../plugins/team-auth.js';
import { teamAuthPreHandler } from './team-helpers.js';

function teamOtpTestBypassActive(phone: string): boolean {
  if (process.env.OTP_TEST_BYPASS !== '1') return false;
  const raw = process.env.OTP_TEST_PHONES ?? '';
  const allowed = new Set(
    raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => normalizeIndianPhone(p)),
  );
  return allowed.has(phone);
}

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

export const teamSessionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ─── POST /team/login (Password Login) ───────────────────────────
  server.post('/login', async (request) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid credentials');

    const member = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });
    if (!member || !member.is_active || !verifyPassword(body.data.password, member.password_hash)) {
      throw forbidden('Invalid credentials');
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

  // ─── POST /team/otp/send (Send OTP via Phone or Email) ───────────
  server.post('/otp/send', async (request) => {
    const body = SendOtpSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid phone or email', 'identifier');

    const raw = body.data.identifier.trim();
    const isPhone = isValidIndianPhone(raw) || /^\d{10}$/.test(raw.replace(/\D/g, ''));
    const normalizedPhone = isPhone ? normalizeIndianPhone(raw.replace(/\D/g, '').slice(-10)) : null;
    const normalizedEmail = !isPhone && raw.includes('@') ? raw.toLowerCase() : null;

    if (!normalizedPhone && !normalizedEmail) {
      throw validationError('Please enter a valid 10-digit mobile number or email address', 'identifier');
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
      throw validationError('No active team member found with this mobile number or email', 'identifier');
    }

    // If member has a phone number matching or configured, send SMS/WhatsApp OTP
    if (normalizedPhone && member.phone) {
      if (teamOtpTestBypassActive(member.phone)) {
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
        try {
          const redis = getSessionRedis();
          await redis.set(`team:otp:${member.phone}`, code, 'EX', 600);
        } catch {
          // Redis down in local test
        }
        console.log(`[team] Development OTP for ${member.phone}: ${code}`);
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
    try {
      const redis = getSessionRedis();
      await redis.set(`team:email-otp:${member.email}`, code, 'EX', 600);
    } catch {
      // Redis fallback
    }

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
  server.post('/otp/verify', async (request) => {
    const body = VerifyOtpSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid OTP code or identifier');

    const raw = body.data.identifier.trim();
    const otp = body.data.otp.trim();
    const isPhone = isValidIndianPhone(raw) || /^\d{10}$/.test(raw.replace(/\D/g, ''));
    const normalizedPhone = isPhone ? normalizeIndianPhone(raw.replace(/\D/g, '').slice(-10)) : null;
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
    if (member.phone && teamOtpTestBypassActive(member.phone)) {
      verified = true;
    } else if (normalizedPhone && member.phone) {
      if (isMsg91OtpConfigured()) {
        const res = await verifyStoredOtp(member.phone, otp, 'login');
        if (res === 'verified') verified = true;
      } else {
        try {
          const redis = getSessionRedis();
          const stored = await redis.getdel(`team:otp:${member.phone}`);
          if (stored === otp) verified = true;
        } catch {
          // Dev mock
          if (otp === '123456') verified = true;
        }
      }
    } else if (normalizedEmail || member.email) {
      try {
        const redis = getSessionRedis();
        const stored = await redis.getdel(`team:email-otp:${member.email}`);
        if (stored === otp) verified = true;
      } catch {
        if (otp === '123456') verified = true;
      }
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
  server.post('/forgot-password', async (request) => {
    const body = ForgotPasswordSchema.safeParse(request.body);
    if (!body.success) throw validationError('Invalid email address', 'email');

    const member = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });

    if (member && member.is_active) {
      const resetCode = randomInt(100_000, 1_000_000).toString();
      try {
        const redis = getSessionRedis();
        await redis.set(`team:pwd-reset:${member.email}`, resetCode, 'EX', 900); // 15 min
      } catch {
        // Redis fallback
      }

      await sendTeamPasswordResetEmail({
        name: member.name,
        email: member.email,
        resetCode,
      });
    }

    return {
      data: {
        message: 'If an active account exists with this email, a password reset code has been sent.',
      },
    };
  });

  // ─── POST /team/reset-password ───────────────────────────────────
  server.post('/reset-password', async (request) => {
    const body = ResetPasswordSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid input');

    const email = body.data.email.toLowerCase();
    const member = await prisma.teamMember.findUnique({
      where: { email },
    });

    if (!member || !member.is_active) {
      throw validationError('Invalid or expired reset code', 'reset_code');
    }

    let codeValid = false;
    try {
      const redis = getSessionRedis();
      const stored = await redis.getdel(`team:pwd-reset:${member.email}`);
      if (stored && stored === body.data.reset_code) {
        codeValid = true;
      }
    } catch {
      // Redis fallback for dev
      if (body.data.reset_code === '123456') codeValid = true;
    }

    if (!codeValid) {
      throw validationError('Invalid or expired reset code. Please request a new code.', 'reset_code');
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
