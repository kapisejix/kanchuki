// Admin routes aggregator — auth helpers in admin-auth.ts, domain modules in ./admin/.
// Auto-split via scripts/split-admin-routes.mjs. Re-exports auth helpers for
// back-compat (team.ts, tests, admin-settings.ts import from './admin.js').
import type { FastifyPluginAsync } from 'fastify';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifySync } from 'otplib';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { verifyPassword } from '../plugins/team-auth.js';
import { adminSessionEmail, signAdminSession } from './admin-auth.js';
import { adminAuthPreHandler } from './admin-auth.js';
import {
  adminActivityRoutes,
  adminAiRoutes,
  adminBackupsRoutes,
  adminContactRoutes,
  adminDataRoutes,
  adminIntegrationsRoutes,
  adminMediaRoutes,
  adminMiscRoutes,
  adminModerationRoutes,
  adminPhotoCleanupRoutes,
  adminPlansRoutes,
  adminRetailersRoutes,
  adminStorageRoutes,
  adminCommissionRoutes,
  adminFestivalsRoutes,
  adminIncentiveRoutes,
  adminPartnerRoutes,
  adminWhatsAppCatalogRoutes,
  adminFestivalBackgroundsRoutes,
} from './admin/index.js';

export {
  validAdminKey,
  signAdminSession,
  verifyAdminSession,
  adminSessionEmail,
  ipInCidr,
  isIpAllowlisted,
  adminAuthPreHandler,
} from './admin-auth.js';

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/login ───────────────────────────────────────────
  // Authenticate with email + password (scrypt) + optional TOTP.
  // SECURITY §8: email + password + TOTP (when TOTP_SECRET is configured).
  // S-003: strict per-route rate limit (5 attempts / 15 min per IP)
  server.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } } },
    async (request, reply) => {
      const body = z
        .object({
          email: z.string().email('Invalid email'),
          password: z.string().min(1, 'Password is required').max(128),
          totp_code: z
            .string()
            .length(6)
            .regex(/^\d{6}$/, 'TOTP code must be 6 digits')
            .optional(),
        })
        .parse(request.body);

      const expectedEmail = process.env.ADMIN_EMAIL;
      const expectedHash = process.env.ADMIN_PASSWORD_HASH;
      const totpSecret = process.env.ADMIN_TOTP_SECRET;

      if (!expectedEmail || !expectedHash) {
        request.log.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not configured');
        throw forbidden('Invalid credentials');
      }

      // Compare email (case-insensitive)
      if (body.email.toLowerCase() !== expectedEmail.toLowerCase()) {
        throw forbidden('Invalid credentials');
      }

      // Compare password hash — support both scrypt (salt:hash) and legacy HMAC-SHA256 format
      // SECURITY: scrypt is the only format for new deployments; legacy HMAC is deprecated.
      const hashIncludesColon = expectedHash.includes(':');
      let passwordValid: boolean;

      if (hashIncludesColon) {
        // scrypt format (salt:hash) — same as team-auth.ts
        passwordValid = verifyPassword(body.password, expectedHash);
      } else {
        // Legacy HMAC-SHA256 format — deprecated, scrypt preferred
        // Log a warning so ops knows to upgrade
        request.log.warn(
          'ADMIN_PASSWORD_HASH appears to be legacy HMAC-SHA256 format. ' +
            'Generate a scrypt hash using scripts/generate-admin-hash.ts and update the env var.',
        );
        const providedHash = createHmac('sha256', 'admin-password').update(body.password).digest();
        const expectedHashBuf = Buffer.from(expectedHash, 'hex');
        passwordValid =
          providedHash.length === expectedHashBuf.length &&
          timingSafeEqual(providedHash, expectedHashBuf);
      }

      if (!passwordValid) {
        throw forbidden('Invalid credentials');
      }

      // TOTP verification (SECURITY §8)
      // If ADMIN_TOTP_SECRET is set, require valid totp_code on every login.
      if (totpSecret) {
        if (!body.totp_code) {
          throw validationError('TOTP code is required. Check your authenticator app.');
        }

        const totpResult = verifySync({ token: body.totp_code, secret: totpSecret });
        if (!totpResult.valid) {
          throw forbidden('Invalid TOTP code');
        }
      }

      request.log.info('Admin login successful');

      // Generate CSRF token and set as SameSite cookie (defense-in-depth)
      const csrfToken = randomBytes(32).toString('hex');
      reply.setCookie('csrf-token', csrfToken, {
        path: '/v1/admin',
        // 'none' in prod: web and api live on different *.up.railway.app
        // subdomains — up.railway.app is public-suffix-listed, so each
        // subdomain is its own "site" and 'strict'/'lax' would never send
        // this cookie cross-service. 'none' requires secure, already true
        // in prod. Dev stays 'strict' — localhost is same-site across ports.
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400, // 24 hours
      });

      return {
        data: {
          token: await signAdminSession(expectedEmail),
          csrf_token: csrfToken,
          email: body.email,
          totp_enabled: !!totpSecret,
        },
      };
    },
  );

  // ─── GET /admin/session ───────────────────────────────────────
  // DB-free session validity check for the admin panel's refresh gate.
  // The panel previously validated against GET /admin/stats — a
  // DB-backed endpoint — so any database hiccup 500'd the check and the
  // panel logged the admin out on every page refresh (and every admin API
  // call then 403'd with an empty x-admin-key). Session validity is purely
  // key/JWT auth (enforced by adminAuthPreHandler above) and never touches
  // the database.
  server.get('/session', async (request) => {
    const email = await adminSessionEmail(request.headers['x-admin-key'] as string | undefined);
    return { data: { authenticated: true, ...(email ? { email } : {}) } };
  });

  // ─── GET /admin/csrf-token ────────────────────────────────────
  // Returns a fresh CSRF token (set as cookie + response body) for the admin
  // panel to include as x-csrf-token header on mutating requests.
  server.get('/csrf-token', async (_request, reply) => {
    const csrfToken = randomBytes(32).toString('hex');
    reply.setCookie('csrf-token', csrfToken, {
      path: '/v1/admin',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400,
    });
    return { data: { csrf_token: csrfToken } };
  });

  // admin-retailers — auto-split module
  await server.register(adminRetailersRoutes);
  // admin-plans — auto-split module
  await server.register(adminPlansRoutes);
  // admin-misc — auto-split module
  await server.register(adminMiscRoutes);
  // admin-activity — auto-split module
  await server.register(adminActivityRoutes);
  // admin-contact — public /contact form messages (ContactSubmission audit entries)
  await server.register(adminContactRoutes);
  // admin-media — auto-split module
  await server.register(adminMediaRoutes);
  // admin-data — auto-split module
  await server.register(adminDataRoutes);
  // admin-integrations — auto-split module
  await server.register(adminIntegrationsRoutes);
  // admin-backups — auto-split module
  await server.register(adminBackupsRoutes);
  // admin-moderation — auto-split module
  await server.register(adminModerationRoutes);
  // admin-ai — auto-split module
  await server.register(adminAiRoutes);
  // admin-photo-cleanup — standalone bg-removal script test page
  await server.register(adminPhotoCleanupRoutes);
  // admin-storage — R2 compression savings report (reads COMPRESS_R2_IMAGES audit entries)
  await server.register(adminStorageRoutes);
  // admin-commission — 3% monthly-commission pool + expense ledger
  await server.register(adminCommissionRoutes);
  await server.register(adminFestivalsRoutes);
  // admin-incentives — Smart Incentive Engine management
  await server.register(adminIncentiveRoutes);
  // admin-partners — Partner Network Manager oversight
  await server.register(adminPartnerRoutes);
  // admin-whatsapp-catalog — Phase II WhatsApp catalog sync monitor
  await server.register(adminWhatsAppCatalogRoutes);
  // admin-festival-backgrounds — Seasonal background library management
  await server.register(adminFestivalBackgroundsRoutes);
};
