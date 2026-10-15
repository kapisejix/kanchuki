import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { supportSessionsEnabled } from '../lib/support-sessions-flag.js';
import { type SupportScope, verifyCatalogUploadToken, verifySupportToken } from './team-auth.js';

// ─── Types ────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    retailerId: string;
    retailerAuthUserId: string;
    staffRole: string | null;
    // F-020: set only when this request is authenticated via a delegated
    // catalog-upload session token, not a real retailer/staff login.
    catalogDelegate: { team_member_id: string; ticket_id: string } | null;
    // Set only when authenticated via a retailer-approved support session token.
    supportDelegate: {
      team_member_id: string;
      ticket_id: string;
      grant_id: string;
      scope: SupportScope;
    } | null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Decode JWT header to check algorithm without full verification. */
function decodeJwtHeader(token: string): { alg?: string; kid?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const headerRaw = parts[0];
    if (!headerRaw) return null;
    const header = JSON.parse(base64UrlDecode(headerRaw).toString('utf8'));
    return { alg: header.alg, kid: header.kid };
  } catch {
    return null;
  }
}

/** Extract payload claims (sub, exp) without signature verification. */
function decodeJwtPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadRaw = parts[1];
    if (!payloadRaw) return null;
    return JSON.parse(base64UrlDecode(payloadRaw).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Verify a Supabase-issued HS256 JWT locally using the shared secret.
 * This works when SUPABASE_JWT_SECRET is set and the token uses
 * HMAC-SHA256 signing (legacy Supabase projects).
 */
function verifyHs256Jwt(token: string): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  let payload: { sub?: string; exp?: number };
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null;

  return { sub: payload.sub };
}

// Created once and reused — createRemoteJWKSet caches the key set internally
// (with a cooldown between refetches). Recreating it per-call defeats that
// cache and adds a JWKS network round-trip to every authenticated request.
let jwks: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

/**
 * Verify a Supabase-issued ES256 JWT using the JWKS endpoint.
 * New Supabase projects use ES256 (ECDSA) by default, which requires
 * the public key from Supabase's JWKS endpoint rather than a shared secret.
 */
async function verifyEs256Jwt(token: string): Promise<{ sub: string } | null> {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) return null;

    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    }

    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['ES256'],
    });

    if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) {
      return null;
    }

    return { sub: payload.sub as string };
  } catch {
    return null;
  }
}

/**
 * Verify a Supabase JWT by trying multiple strategies in order:
 * 1. Local HS256 (legacy, uses shared secret)
 * 2. Remote JWKS ES256 (default for new Supabase projects)
 */
async function verifySupabaseJwt(token: string): Promise<{ sub: string } | null> {
  // Strategy 1: Try local HS256 verification (fast, no network)
  const hs256Claims = verifyHs256Jwt(token);
  if (hs256Claims) return hs256Claims;

  // Strategy 2: Check the algorithm in the JWT header
  const header = decodeJwtHeader(token);
  if (!header) return null;

  // For ES256, use JWKS-based verification
  if (header.alg === 'ES256') {
    return await verifyEs256Jwt(token);
  }

  // For unknown algorithms, try payload-only checks (sub + exp)
  // in development mode only. Never bypass signature verification
  // in production — this would accept forged tokens.
  if (process.env.NODE_ENV === 'development') {
    const payload = decodeJwtPayload(token);
    if (payload?.sub && payload.exp && payload.exp * 1000 > Date.now()) {
      return { sub: payload.sub };
    }
  }

  return null;
}

// ─── Staff access control ──────────────────────────────────────────
// A Staff row (shop team member added by the retailer, see staff.ts) gets a
// retailer-scoped token but must NOT reach owner-only surfaces (billing,
// KYC, WhatsApp API config, staff management itself, account deletion, ...).
// Single allowlist here — not scattered per-route checks — so every new
// route is owner-only by default and has to opt in for staff access.
// Salesperson is a further-restricted subset of manager: read-only catalog,
// no categories, customer creation only. Any staff.role other than
// 'salesperson' (manager, or the rare staff row created with role 'owner')
// gets the full manager set.
type StaffRule = { method: string; path: string; exact?: boolean };

const MANAGER_ALLOWED_ROUTES: StaffRule[] = [
  { method: '*', path: '/v1/products' }, // add/edit/delete products
  { method: '*', path: '/v1/categories' },
  { method: '*', path: '/v1/collections' }, // create/manage collections to share
  { method: '*', path: '/v1/size-charts' },
  { method: 'POST', path: '/v1/customers', exact: true }, // add new customers only — no list/edit/delete
  { method: 'GET', path: '/v1/retailers/me', exact: true }, // read-only shop info (name shown in app header)
  { method: 'POST', path: '/v1/retailers/me/qr-slug', exact: true }, // Store QR code
  // Growth: campaigns (create/edit/preview/send), reactivation audiences,
  // promotions, festivals, analytics, social caption/templates.
  { method: 'GET', path: '/v1/growth/campaigns', exact: true },
  { method: 'POST', path: '/v1/growth/campaigns', exact: true },
  { method: 'GET', path: '/v1/growth/campaigns/stats', exact: true },
  { method: '*', path: '/v1/growth/campaigns/:id', exact: true },
  { method: 'POST', path: '/v1/growth/campaigns/:id/preview', exact: true },
  // Send: allowed, but the handler refuses non-owners unless the server-side
  // WhatsApp API path is in use (manual wa.me links would expose numbers).
  { method: 'POST', path: '/v1/growth/campaigns/:id/send', exact: true },
  { method: 'POST', path: '/v1/growth/reactivation-suggestions', exact: true }, // ids + counts only
  { method: '*', path: '/v1/growth/promotions' },
  { method: 'GET', path: '/v1/growth/festivals' },
  { method: 'GET', path: '/v1/growth/analytics' },
  { method: '*', path: '/v1/growth/social-caption-suggest' },
  { method: '*', path: '/v1/growth/social-templates' },
  // Growth hub (store/catalog management + customer insight). None of these
  // return customer phone numbers (pinned by staff-access.test.ts).
  { method: 'POST', path: '/v1/growth/ai-campaign', exact: true },
  { method: 'GET', path: '/v1/growth/engagement', exact: true },
  { method: 'GET', path: '/v1/growth/inventory-alerts', exact: true },
  { method: 'POST', path: '/v1/growth/products/:id/descriptions', exact: true },
  { method: 'POST', path: '/v1/growth/translate/message', exact: true },
  { method: '*', path: '/v1/growth/products/:id/videos' },
  { method: 'POST', path: '/v1/growth/products/:id/video/generate', exact: true },
  { method: 'DELETE', path: '/v1/growth/videos/:id', exact: true },
  { method: 'GET', path: '/v1/retailers/reviews/products', exact: true },
  { method: 'GET', path: '/v1/retailers/reviews/store', exact: true },
  { method: 'GET', path: '/v1/retailers/reviews/summary', exact: true },
  // Social: post + track only — connect/disconnect/callback stay owner-only.
  { method: 'POST', path: '/v1/retailers/me/social/posts', exact: true },
  { method: 'GET', path: '/v1/retailers/me/social/accounts' },
  // Scheduler (F-043): view calendar/status, edit a caption, skip/retry a post,
  // pause/resume a plan. Creating/confirming/ending a plan and slide edits are
  // NOT listed → owner-only by default-deny. Connect/reconnect is unchanged.
  { method: 'GET', path: '/v1/retailers/me/social/schedule' },
  { method: 'PATCH', path: '/v1/retailers/me/social/schedule/posts' },
  { method: 'PATCH', path: '/v1/retailers/me/social/schedule/plan-state' },
  { method: 'GET', path: '/v1/retailers/me/stats', exact: true },
  { method: 'GET', path: '/v1/retailers/me/analytics', exact: true },
  // Customer list/detail — read-only, phone masked server-side (maskPhoneForRequest).
  { method: 'GET', path: '/v1/customers' },
];

const SALESPERSON_ALLOWED_ROUTES: StaffRule[] = [
  { method: 'GET', path: '/v1/products' }, // view catalog only — no add/edit/delete
  { method: 'GET', path: '/v1/categories' }, // view only
  { method: 'POST', path: '/v1/customers', exact: true }, // add new customers only
  { method: 'GET', path: '/v1/retailers/me', exact: true }, // shop name shown in app header
  { method: 'GET', path: '/v1/collections' }, // share a collection link on WhatsApp
];

function matchesRules(method: string, routeUrl: string, rules: StaffRule[]): boolean {
  return rules.some((rule) => {
    if (rule.method !== '*' && rule.method !== method) return false;
    if (rule.exact) return routeUrl === rule.path;
    return routeUrl === rule.path || routeUrl.startsWith(`${rule.path}/`);
  });
}

export function staffCanAccess(method: string, routeUrl: string, role?: string): boolean {
  const rules = role === 'salesperson' ? SALESPERSON_ALLOWED_ROUTES : MANAGER_ALLOWED_ROUTES;
  return matchesRules(method, routeUrl, rules);
}

// ─── Catalog-upload delegate access control (F-020) ────────────────
// Narrower than even the salesperson allowlist above — a delegated session
// exists for exactly one purpose (upload this retailer's catalog while the
// team member is on-site) and must not reach customers, billing, staff, or
// account settings for a retailer whose real login was never shared.
const CATALOG_DELEGATE_ALLOWED_ROUTES: StaffRule[] = [
  { method: '*', path: '/v1/products' }, // add/edit products + photos
  { method: '*', path: '/v1/catalog-import' }, // bulk/rack-photo onboarding (F-001c/d)
  { method: 'GET', path: '/v1/categories' },
  { method: 'GET', path: '/v1/size-charts' },
];

export function catalogDelegateCanAccess(method: string, routeUrl: string): boolean {
  return matchesRules(method, routeUrl, CATALOG_DELEGATE_ALLOWED_ROUTES);
}

// ─── Support-session access control ────────────────────────────────
// Deny by default, per scope. Never reachable under any scope: billing,
// subscription, payout/referral, team/staff management, account delete/suspend,
// OTP, export, social connect/disconnect. No DELETE rule exists below.
function rw(path: string): StaffRule[] {
  return ['GET', 'POST', 'PATCH', 'PUT'].map((method) => ({ method, path }));
}

const SUPPORT_READ_ROUTES: StaffRule[] = [
  { method: 'GET', path: '/v1/products' },
  { method: 'GET', path: '/v1/collections' },
  { method: 'GET', path: '/v1/customers' }, // phone masked server-side (isRealOwner false)
  { method: 'GET', path: '/v1/retailers/me', exact: true },
  { method: 'GET', path: '/v1/retailers/me/stats', exact: true },
  { method: 'GET', path: '/v1/retailers/me/analytics', exact: true },
  { method: 'GET', path: '/v1/growth/analytics' },
];

const SUPPORT_SCOPE_ROUTES: Record<SupportScope, StaffRule[]> = {
  DEMO: SUPPORT_READ_ROUTES,
  GROWTH: [
    ...SUPPORT_READ_ROUTES,
    ...rw('/v1/products'),
    ...rw('/v1/collections'),
    { method: 'GET', path: '/v1/growth/campaigns', exact: true },
    { method: 'POST', path: '/v1/growth/campaigns', exact: true },
    { method: 'GET', path: '/v1/growth/campaigns/stats', exact: true },
    ...['GET', 'PATCH', 'PUT'].map((method) => ({
      method,
      path: '/v1/growth/campaigns/:id',
      exact: true,
    })),
    { method: 'POST', path: '/v1/growth/campaigns/:id/preview', exact: true },
    // Send: handler refuses non-owners on the manual wa.me path (numbers in links).
    { method: 'POST', path: '/v1/growth/campaigns/:id/send', exact: true },
    ...rw('/v1/growth/promotions'),
    { method: 'GET', path: '/v1/growth/festivals' },
    ...rw('/v1/growth/social-caption-suggest'),
    ...rw('/v1/growth/social-templates'),
    { method: 'POST', path: '/v1/growth/ai-campaign', exact: true },
    // Composer + account list only; connect/disconnect/callback stay owner-only.
    { method: 'POST', path: '/v1/retailers/me/social/posts', exact: true },
    { method: 'GET', path: '/v1/retailers/me/social/accounts' },
  ],
  MAINTENANCE: [
    ...SUPPORT_READ_ROUTES,
    ...rw('/v1/products'),
    ...rw('/v1/categories'),
    ...rw('/v1/size-charts'),
    { method: 'PUT', path: '/v1/retailers/me', exact: true }, // profile + GST fields
    // ponytail: WhatsApp API config is read-only here; credential edit stays owner-only.
    { method: 'GET', path: '/v1/retailers/me/whatsapp-api', exact: true },
  ],
};

export function supportDelegateCanAccess(
  method: string,
  routeUrl: string,
  scope: SupportScope,
): boolean {
  return matchesRules(method, routeUrl, SUPPORT_SCOPE_ROUTES[scope]);
}

/** Pure liveness check — re-run on every request so revoke/expiry/reassign bite at once. */
export function supportGrantLive(
  grant: {
    status: string;
    expires_at: Date | null;
    retailer_id: string;
    team_member_id: string;
    ticket_id: string;
    scope: string;
    ticket: { status: string; assigned_to_id: string | null };
    team_member: { is_active: boolean };
    retailer: { is_suspended: boolean; deleted_at: Date | null };
  } | null,
  claims: { retailer_id: string; team_member_id: string; ticket_id: string; scope: string },
  now: Date = new Date(),
): boolean {
  return (
    !!grant &&
    grant.status === 'APPROVED' &&
    !!grant.expires_at &&
    grant.expires_at.getTime() > now.getTime() &&
    grant.retailer_id === claims.retailer_id &&
    grant.team_member_id === claims.team_member_id &&
    grant.ticket_id === claims.ticket_id &&
    grant.scope === claims.scope &&
    grant.ticket.status === 'ASSIGNED' &&
    grant.ticket.assigned_to_id === claims.team_member_id &&
    grant.team_member.is_active &&
    !grant.retailer.is_suspended &&
    !grant.retailer.deleted_at
  );
}

// A delegated catalog-upload session gets staffRole = null — the same
// sentinel value a real retailer owner has — because it isn't a Staff row.
// Any route-level "owner only" check must use this instead of a bare
// `staffRole !== null` comparison, or a delegate token (meant to be narrower
// than even the salesperson allowlist) reads as a real owner.
export function isRealOwner(request: FastifyRequest): boolean {
  return request.staffRole === null && !request.catalogDelegate && !request.supportDelegate;
}

/**
 * Staff (manager/salesperson) must never receive a customer's full number.
 * Masking is done here, server-side — a UI-only mask still ships the number
 * over the wire. "98•••••210" keeps enough to tell customers apart.
 */
export function maskPhoneForRequest(request: FastifyRequest, phone: string): string {
  if (isRealOwner(request)) return phone;
  const d = phone.replace(/\D/g, '');
  return d.length < 6 ? '••••••' : `${d.slice(0, 2)}•••••${d.slice(-3)}`;
}

// ─── Dual-identity try-on (F-040) ──────────────────────────
// The try-on endpoints are called by two clients with two different credential
// shapes: the retailer app with a Bearer token, the customer PWA with only the
// `kanchuki_passport` cookie. The Bearer case is the normal flow below; the
// cookie-only case is deferred to the route, which validates the session and
// resolves the retailer from the product. Both paths are listed here together
// so the route cannot silently gain a third URL that loses its handling.
const TRY_ON_ROUTES = new Set(['/v1/products/:id/try-on', '/v1/products/:id/try-on/status']);

export function isTryOnRoute(routeUrl: string | undefined): boolean {
  return !!routeUrl && TRY_ON_ROUTES.has(routeUrl);
}

// ─── Plugin ───────────────────────────────────────────────────────

/**
 * Verifies Supabase JWT and attaches retailer context to request.
 * Supports both HS256 (legacy) and ES256 (new) Supabase tokens.
 */
export const authPlugin: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest('retailerId', '');
  server.decorateRequest('retailerAuthUserId', '');
  server.decorateRequest('staffRole', null);
  server.decorateRequest('catalogDelegate', null);
  server.decorateRequest('supportDelegate', null);

  // Support sessions: every mutation under a support token gets its own audit
  // entry (actor_type 'support_delegate'), same one-hook approach as above.
  server.addHook('onResponse', async (request: FastifyRequest, reply) => {
    if (!request.supportDelegate) return;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    if (reply.statusCode >= 400) return;

    await prisma.auditLog
      .create({
        data: {
          actor_type: 'support_delegate',
          actor_id: request.supportDelegate.team_member_id,
          action: request.method.toLowerCase(),
          resource_type: 'route',
          resource_id: request.routeOptions.url ?? request.url,
          metadata: {
            ticket_id: request.supportDelegate.ticket_id,
            grant_id: request.supportDelegate.grant_id,
            scope: request.supportDelegate.scope,
            retailer_id: request.retailerId,
          },
          ip_address: request.ip,
        },
      })
      .catch((err) => request.log.error({ err }, 'Failed to write support-delegate audit log'));
  });

  // F-020: every mutation made under a delegated catalog-upload session gets
  // its own audit trail entry, regardless of which route it hit — one hook
  // here instead of touching every mutation call site in products.ts /
  // catalog-import.ts.
  server.addHook('onResponse', async (request: FastifyRequest, reply) => {
    if (!request.catalogDelegate) return;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    if (reply.statusCode >= 400) return;

    await prisma.auditLog
      .create({
        data: {
          actor_type: 'catalog_delegate',
          actor_id: request.catalogDelegate.team_member_id,
          action: request.method.toLowerCase(),
          resource_type: 'route',
          resource_id: request.routeOptions.url ?? request.url,
          metadata: {
            ticket_id: request.catalogDelegate.ticket_id,
            retailer_id: request.retailerId,
          },
          ip_address: request.ip,
        },
      })
      .catch((err) => request.log.error({ err }, 'Failed to write catalog-delegate audit log'));
  });

  server.addHook('preHandler', async (request: FastifyRequest, reply) => {
    // Skip auth for public routes
    if (request.routeOptions.url?.startsWith('/v1/public')) return;
    if (request.routeOptions.url === '/health') return;
    // Razorpay webhooks authenticate via HMAC signature, not JWT
    if (request.routeOptions.url === '/v1/billing/webhook') return;
    if (request.routeOptions.url === '/v1/public/webhooks/razorpay') return;
    // Admin routes authenticate via x-admin-key header (checked in admin.ts)
    if (request.routeOptions.url?.startsWith('/v1/admin')) return;
    // Team routes authenticate via their own Bearer JWT or x-admin-key (checked in team.ts)
    if (request.routeOptions.url?.startsWith('/v1/team')) return;
    // Auth routes are how a client obtains a Bearer token in the first place
    if (request.routeOptions.url?.startsWith('/v1/auth')) return;
    // Remote try-on endpoints (customer-facing, no auth)
    if (request.routeOptions.url === '/v1/try-on/remote') return;
    if (request.routeOptions.url?.startsWith('/v1/try-on/remote/')) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      // F-040: a cookieless request to the try-on route is still a hard 401 here
      // — only the cookie-bearing customer case is handed to the route handler.
      if (
        isTryOnRoute(request.routeOptions.url) &&
        request.headers.cookie?.includes('kanchuki_passport=')
      ) {
        return;
      }
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token', status: 401 },
      });
    }

    const token = authHeader.slice(7);

    // F-020: delegated catalog-upload session — checked first since it's a
    // cheap local HMAC verify (no JWKS round-trip) and structurally can't
    // collide with a real Supabase JWT (different signing secret).
    const delegateClaims = await verifyCatalogUploadToken(token);
    if (delegateClaims) {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: delegateClaims.ticket_id },
        select: { ticket_type: true, status: true, retailer_id: true, assigned_to_id: true },
      });
      const stillLive =
        ticket &&
        ticket.ticket_type === 'CATALOG_UPLOAD' &&
        ticket.status === 'ASSIGNED' &&
        ticket.retailer_id === delegateClaims.retailer_id &&
        ticket.assigned_to_id === delegateClaims.team_member_id;

      if (!stillLive) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'This catalog upload session has ended',
            status: 401,
          },
        });
      }

      const routeUrl = request.routeOptions.url ?? request.url;
      if (!catalogDelegateCanAccess(request.method, routeUrl)) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'This session can only manage the catalog',
            status: 403,
          },
        });
      }

      request.retailerId = delegateClaims.retailer_id;
      request.retailerAuthUserId = '';
      request.staffRole = null;
      request.catalogDelegate = {
        team_member_id: delegateClaims.team_member_id,
        ticket_id: delegateClaims.ticket_id,
      };
      return;
    }

    // Support session: retailer-approved, scoped, ≤24h. The grant row is
    // re-read on every request so revoke / expiry / reassignment bite at once.
    const supportClaims = await verifySupportToken(token);
    if (supportClaims) {
      const ended = () =>
        reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'This support session has ended', status: 401 },
        });
      if (!(await supportSessionsEnabled())) return ended();

      const grant = await prisma.supportSessionGrant.findUnique({
        where: { id: supportClaims.grant_id },
        select: {
          status: true,
          expires_at: true,
          retailer_id: true,
          team_member_id: true,
          ticket_id: true,
          scope: true,
          ticket: { select: { status: true, assigned_to_id: true } },
          team_member: { select: { is_active: true } },
          retailer: { select: { is_suspended: true, deleted_at: true } },
        },
      });
      if (!supportGrantLive(grant, supportClaims)) return ended();

      const routeUrl = request.routeOptions.url ?? request.url;
      if (!supportDelegateCanAccess(request.method, routeUrl, supportClaims.scope)) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'This support session scope does not allow that action',
            status: 403,
          },
        });
      }

      request.retailerId = supportClaims.retailer_id;
      request.retailerAuthUserId = '';
      request.staffRole = null;
      request.supportDelegate = {
        team_member_id: supportClaims.team_member_id,
        ticket_id: supportClaims.ticket_id,
        grant_id: supportClaims.grant_id,
        scope: supportClaims.scope,
      };
      return;
    }

    const claims = await verifySupabaseJwt(token);

    if (!claims) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      });
    }

    // Load retailer from DB (staff and owners both need retailer context)
    const retailer = await prisma.retailer.findUnique({
      where: { auth_user_id: claims.sub, deleted_at: null },
      select: { id: true, auth_user_id: true, plan_status: true, is_suspended: true },
    });

    if (retailer) {
      // Retailer owner — standard flow
      // F-015: a suspension made after login must also stop the existing
      // session — not just block a fresh OTP login (auth.ts checks that path).
      if (retailer.is_suspended) {
        return reply.status(403).send({
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'This account has been suspended. Please contact support for assistance.',
            status: 403,
          },
        });
      }
      request.retailerId = retailer.id;
      request.retailerAuthUserId = claims.sub;
      request.staffRole = null;
    } else {
      // Not a retailer — check if this is a staff member
      const staff = await prisma.staff.findFirst({
        where: { auth_user_id: claims.sub, is_active: true },
        select: {
          id: true,
          role: true,
          retailer_id: true,
          retailer: { select: { is_suspended: true } },
        },
      });

      if (!staff) {
        return reply.status(403).send({
          error: {
            code: 'RETAILER_NOT_FOUND',
            message: 'Account not found. Please complete registration.',
            status: 403,
          },
        });
      }

      if (staff.retailer.is_suspended) {
        return reply.status(403).send({
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'This account has been suspended. Please contact support for assistance.',
            status: 403,
          },
        });
      }

      request.retailerId = staff.retailer_id;
      request.retailerAuthUserId = claims.sub;
      request.staffRole = staff.role;

      const routeUrl = request.routeOptions.url ?? request.url;
      if (!staffCanAccess(request.method, routeUrl, staff.role)) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Your team account does not have access to this section',
            status: 403,
          },
        });
      }
    }
  });
});
