// Auth helpers extracted from admin.ts (see scripts/split-admin-routes.mjs).
// Kept here so domain modules can share them without a circular import back
// into the aggregator. admin.ts re-exports these for back-compat.
import type { FastifyPluginAsync } from 'fastify';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import {
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { INTEGRATION_KEYS, PLAN_PRICING, R2_PATHS } from '@kanchuki/shared';
import { SignJWT, jwtVerify } from 'jose';
import { verifySync } from 'otplib';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { verifyPassword } from '../plugins/team-auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Set by adminAuthPreHandler: the session's email, or 'admin-key' when
    // authenticated with the shared static ADMIN_API_KEY (no individual identity).
    adminId?: string;
  }
}

export function validAdminKey(provided: string | undefined): boolean {
  const expected = process.env.ADMIN_API_KEY ?? '';
  if (!expected || !provided) return false;
  // Hash both sides so timingSafeEqual gets equal-length buffers
  const h = (s: string) => createHmac('sha256', 'admin-key').update(s).digest();
  return timingSafeEqual(h(provided), h(expected));
}

// S-006: login no longer hands the browser the permanent ADMIN_API_KEY.
// It signs a short-lived session token instead, keyed off ADMIN_API_KEY
// (no new env var to configure/rotate). validAdminKey() above still accepts
// the raw static key too — scripts/tests/direct API callers are unaffected.
function sessionSecret(): Uint8Array {
  const key = process.env.ADMIN_API_KEY ?? '';
  return new TextEncoder().encode(`admin-session:${key}`);
}

export async function signAdminSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(sessionSecret());
}

export async function verifyAdminSession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, sessionSecret());
    return true;
  } catch {
    const teamClaims = await verifyTeamToken(token);
}

// Decode the admin email and role from a session JWT or team token.
// Used by GET /admin/session and adminAuthPreHandler for RBAC.
export async function adminSessionInfo(
  token: string | undefined,
): Promise<{ email?: string; role: string } | null> {
    const { payload } = await jwtVerify(token, sessionSecret());
    };
  } catch {
    const teamClaims = await verifyTeamToken(token);
      };
// the admin panel's refresh gate never depends on database health.
export async function adminSessionEmail(token: string | undefined): Promise<string | null> {
  const info = await adminSessionInfo(token);
  return info?.email ?? null;
// CIDR ranges ("103.45.67.0/24"). Does NOT support IPv6 — office networks in
// India overwhelmingly use IPv4, and IPv6 requests will safely fail-closed.
export function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const ipInt = ip.split('.').reduce((a, o) => (a << 8) + Number.parseInt(o, 10), 0) >>> 0;
    if (cidr.includes('/')) {
      const slashIdx = cidr.indexOf('/');
      const cidrIp = cidr.slice(0, slashIdx);
      const prefix = Number.parseInt(cidr.slice(slashIdx + 1), 10);
      if (prefix < 0 || prefix > 32) return false;
      const mask = ~(2 ** (32 - prefix) - 1) >>> 0;
      const cidrInt =
        cidrIp.split('.').reduce((a, o) => (a << 8) + Number.parseInt(o, 10), 0) >>> 0;
      return (ipInt & mask) === (cidrInt & mask);
    }
    const cidrInt = cidr.split('.').reduce((a, o) => (a << 8) + Number.parseInt(o, 10), 0) >>> 0;
    return ipInt === cidrInt;
  } catch {
    return false; // Malformed entry never matches — fail closed
  }
}

/** Check if an IP is allowlisted. Pass `undefined` when request.ip may be missing (trustProxy off). */
export function isIpAllowlisted(ip: string | undefined): boolean {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? '';
  if (!raw.trim()) return true; // No allowlist configured = all IPs permitted (dev/localhost)
  if (!ip) {
    // IP is undefined — trustProxy may be misconfigured (see SECURITY §8 / B-012).
    // Fail CLOSED when an allowlist is set: unknown origin must not bypass it.
    console.error(
      '[admin] request.ip is undefined but ADMIN_IP_ALLOWLIST is set — denying access. Check trustProxy config.',
    );
    return false;
  }
  return raw.split(',').some((entry) => ipInCidr(ip, entry.trim()));
}

// Shared admin preHandler (IP allowlist + key/session + CSRF). Fastify hooks
// don't cross sibling plugin boundaries, so every plugin registered under
// /v1/admin must install this itself — see adminSettingsRoutes in
// admin-settings.ts, which previously assumed this hook applied and was
// fully unauthenticated as a result.
export async function adminAuthPreHandler(
  request: import('fastify').FastifyRequest,
  _reply: import('fastify').FastifyReply,
): Promise<void> {
  // IP allowlist check (SECURITY §8) — applies to ALL admin routes including login
  // to prevent reconnaissance from non-allowlisted IPs.
  if (!isIpAllowlisted(request.ip)) throw forbidden('Access denied — IP not allowlisted');

  // Skip auth for login endpoint — use request.url (raw URL) for reliability
  if (request.url === '/v1/admin/login') return;

  const key = request.headers['x-admin-key'] as string | undefined;
  if (!key) throw forbidden('Invalid admin key');

  const info = await adminSessionInfo(key);
  if (!info) {
    throw forbidden('Invalid admin key');
  }

  // Field staff / surveyors have NO admin dashboard access
  if (info.role === 'MARKETING_AGENT' || info.role === 'SUPPORT_AGENT') {
  // Standard Admin accounts (not Super Admin) are restricted from sensitive endpoints
  if (info.role !== 'SUPER_ADMIN') {
    const path = request.url.toLowerCase();
    const isSuperAdminOnly =
      path.startsWith('/v1/admin/integrations') ||
      path.startsWith('/v1/admin/ai-providers') ||
    if (!csrfCookie || !csrfHeader) {
      throw forbidden(
        'Invalid CSRF token — include x-csrf-token header matching csrf-token cookie',
      );
    }
    // Timing-safe comparison (S-004) — prevent oracle attacks via response-time variance
    const a = Buffer.from(csrfCookie);
    const b = Buffer.from(csrfHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw forbidden(
        'Invalid CSRF token — include x-csrf-token header matching csrf-token cookie',
      );
    }
  }
}
