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

type IntegrationKeyEntry = (typeof INTEGRATION_KEYS)[number];
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { verifyPassword } from '../plugins/team-auth.js';

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
    return false;
  }
}

// ─── IP Allowlist (SECURITY §8) ──────────────────────────────────────
// ADMIN_IP_ALLOWLIST env var: comma-separated IPs and/or CIDR ranges.
// Empty/unset = all IPs allowed (dev mode). Production should restrict to
// office/static IPs, e.g. "103.45.67.89/32,203.0.113.0/24".

// IPv4 CIDR matcher (SECURITY §8). Supports single IPs ("192.168.1.1") and
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

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request, _reply) => {
    // IP allowlist check (SECURITY §8) — applies to ALL admin routes including login
    // to prevent reconnaissance from non-allowlisted IPs.
    if (!isIpAllowlisted(request.ip)) throw forbidden('Access denied — IP not allowlisted');

    // Skip auth for login endpoint — use request.url (raw URL) for reliability
    if (request.url === '/v1/admin/login') return;

    const key = request.headers['x-admin-key'] as string | undefined;
    if (!key || !(validAdminKey(key) || (await verifyAdminSession(key)))) {
      throw forbidden('Invalid admin key');
    }

    // CSRF protection (SECURITY §4):
    // The admin uses header-based auth (x-admin-key), which is inherently
    // CSRF-safe because custom headers cannot be sent cross-origin without
    // CORS preflight. As defense-in-depth, we also require a SameSite cookie
    // CSRF token on mutating requests (POST, PUT, PATCH, DELETE).
    //
    // GET/HEAD/OPTIONS are idempotent — no CSRF risk.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
      const csrfCookie = request.cookies['csrf-token'];
      const csrfHeader = request.headers['x-csrf-token'] as string | undefined;

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
  });

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

  // ─── GET /admin/stats ───────────────────────────────────────────
  server.get('/stats', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [
      totalRetailers,
      activeSubscriptions,
      trialRetailers,
      totalProducts,
      totalCollections,
      viewsThisMonth,
      enquiriesThisMonth,
    ] = await Promise.all([
      prisma.retailer.count({ where: { deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null, plan_status: 'ACTIVE' } }),
      prisma.retailer.count({ where: { deleted_at: null, plan_status: 'TRIAL' } }),
      prisma.product.count({ where: { deleted_at: null } }),
      prisma.collection.count({ where: { deleted_at: null } }),
      prisma.collectionView.count({ where: { created_at: { gte: monthStart } } }),
      prisma.collectionEnquiry.count({ where: { created_at: { gte: monthStart } } }),
    ]);

    return {
      data: {
        total_retailers: totalRetailers,
        active_subscriptions: activeSubscriptions,
        trial_retailers: trialRetailers,
        total_products: totalProducts,
        total_collections: totalCollections,
        views_this_month: viewsThisMonth,
        enquiries_this_month: enquiriesThisMonth,
      },
    };
  });

  // ─── GET /admin/retailers ───────────────────────────────────────
  server.get('/retailers', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
        status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']).optional(),
        suspended: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search, city, state, plan, status, suspended } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          search: undefined,
          city: undefined,
          state: undefined,
          plan: undefined,
          status: undefined,
          suspended: undefined,
        };

    const retailers = await prisma.retailer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
        ...(state ? { state: { equals: state, mode: 'insensitive' as const } } : {}),
        ...(plan ? { plan } : {}),
        ...(status ? { plan_status: status } : {}),
        ...(suspended !== undefined ? { is_suspended: suspended } : {}),
        ...(search
          ? {
              OR: [
                { shop_name: { contains: search, mode: 'insensitive' as const } },
                { city: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        shop_name: true,
        city: true,
        state: true,
        phone: true,
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        created_at: true,
        onboarding_completed: true,
        is_suspended: true,
        _count: {
          select: {
            products: { where: { deleted_at: null } },
            customers: { where: { deleted_at: null } },
            collections: { where: { deleted_at: null } },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = retailers.length > limit;
    const page = hasMore ? retailers.slice(0, limit) : retailers;

    return {
      data: page.map(({ _count, ...r }) => ({
        ...r,
        product_count: _count.products,
        customer_count: _count.customers,
        collection_count: _count.collections,
      })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── DELETE /admin/retailers ─────────────────────────────────────
  // Bulk soft-delete retailers from the admin grid. Archives their
  // collections and deactivates staff, same as the retailer self-delete
  // flow (DELETE /retailers/me) — products/customers/billing kept for GST audit.
  server.delete('/retailers', async (request) => {
    const body = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(request.body);

    // Capture full before-state for vault snapshots + audit log
    const retailersBefore = await prisma.retailer.findMany({
      where: { id: { in: body.ids }, deleted_at: null },
    });
    const collectionsBefore = await prisma.collection.findMany({
      where: { retailer_id: { in: body.ids }, deleted_at: null },
    });

    await prisma.$transaction([
      prisma.retailer.updateMany({
        where: { id: { in: body.ids }, deleted_at: null },
        data: { deleted_at: new Date() },
      }),
      prisma.collection.updateMany({
        where: { retailer_id: { in: body.ids }, deleted_at: null },
        data: { deleted_at: new Date(), status: 'ARCHIVED' },
      }),
      prisma.staff.updateMany({
        where: { retailer_id: { in: body.ids }, is_active: true },
        data: { is_active: false },
      }),
    ]);

    // F-016: Vault snapshot each deleted retailer (fire-and-forget)
    Promise.allSettled(
      retailersBefore.map((r) =>
        vaultDelete({
          source_table: 'retailers',
          source_id: r.id,
          retailer_id: r.id,
          payload: r as unknown as Record<string, unknown>,
          delete_reason: 'admin_bulk_delete',
          deleted_by: 'admin',
        }),
      ),
    );
    // F-016: Vault snapshot each archived collection (fire-and-forget)
    Promise.allSettled(
      collectionsBefore.map((c) =>
        vaultDelete({
          source_table: 'collections',
          source_id: c.id,
          retailer_id: c.retailer_id,
          payload: c as unknown as Record<string, unknown>,
          delete_reason: 'admin_bulk_delete',
          deleted_by: 'admin',
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BULK_DELETE',
        resource_type: 'Retailer',
        metadata: {
          count: body.ids.length,
          before: retailersBefore.map((r) => ({
            id: r.id,
            shop_name: r.shop_name,
            city: r.city,
            plan: r.plan,
            plan_status: r.plan_status,
          })),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_ids: body.ids }, 'Bulk retailer delete');
    return { data: { deleted: body.ids.length } };
  });

  // ─── GET /admin/customers ───────────────────────────────────────
  // Cross-retailer customer list (User Management) — PII, admin-only.
  server.get('/customers', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().max(100).optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, search: undefined };

    const customers = await prisma.customer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        consent_given: true,
        is_blocked: true,
        blocked_at: true,
        blocked_reason: true,
        created_at: true,
        retailer: { select: { id: true, shop_name: true, city: true } },
        _count: { select: { measurements: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = customers.length > limit;
    const page = hasMore ? customers.slice(0, limit) : customers;

    return {
      data: page.map(({ _count, ...c }) => ({ ...c, measurement_count: _count.measurements })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── POST /admin/billing/setup-plans ────────────────────────────
  // Auto-creates all 6 Razorpay plans (3 plans × monthly/annual).
  // Run once after setting RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
  // Creates plans, prints the IDs as env var settings, does NOT modify DB.
  server.post('/billing/setup-plans', async (request) => {
    const created: Record<string, { id: string; period: string }> = {};
    const razorpayKeyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
    const razorpayKeySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';

    for (const planKey of ['STARTER', 'GROWTH', 'PRO'] as const) {
      for (const period of ['monthly', 'annual'] as const) {
        const amountPaise = PLAN_PRICING[planKey][period];
        const name = `${planKey} ${period === 'monthly' ? 'Monthly' : 'Annual'}`;

        const res = await fetch('https://api.razorpay.com/v1/plans', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            period: period === 'monthly' ? 'monthly' : 'yearly',
            interval: 1,
            item: {
              name: `Kanchuki ${name}`,
              description: `Kanchuki ${planKey} plan — ${period} billing`,
              amount: amountPaise,
              currency: 'INR',
            },
            notes: {
              plan: planKey,
              billing_period: period,
            },
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          request.log.error(
            { planKey, period, status: res.status, body },
            'Razorpay plan creation failed',
          );
          continue;
        }

        const plan = (await res.json()) as { id: string };
        created[`RAZORPAY_PLAN_${planKey}_${period === 'monthly' ? 'MONTHLY' : 'ANNUAL'}`] = {
          id: plan.id,
          period,
        };
      }
    }

    const count = Object.keys(created).length;
    request.log.info({ created }, `Created ${count}/6 Razorpay plans`);

    let envSnippet = '# Razorpay plan IDs — set these in your environment\n';
    for (const [key, val] of Object.entries(created)) {
      envSnippet += `${key}=${val.id}\n`;
    }
    if (count === 0) {
      envSnippet = 'No plans created. Check the server logs for Razorpay errors.';
    }

    return {
      data: {
        created: count,
        total: 6,
        env_vars: created,
        env_snippet: envSnippet,
      },
    };
  });

  // ─── GET /admin/retailers/:id ──────────────────────────────────
  // Full retailer detail with product/customer counts, try-on usage, subscription.
  server.get('/retailers/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
      select: {
        id: true,
        shop_name: true,
        owner_name: true,
        phone: true,
        city: true,
        state: true,
        gstin: true,
        address_line1: true,
        address_line2: true,
        pincode: true,
        kyc_status: true,
        kyc_gst_url: true,
        kyc_aadhar_front_url: true,
        kyc_aadhar_back_url: true,
        kyc_submitted_at: true,
        kyc_reviewed_at: true,
        kyc_rejection_reason: true,
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
        onboarding_completed: true,
        onboarding_step: true,
        created_at: true,
        updated_at: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
        max_staff_seats: true,
        is_suspended: true,
        suspended_at: true,
        suspended_reason: true,
        _count: {
          select: {
            products: { where: { deleted_at: null } },
            customers: { where: { deleted_at: null } },
            collections: { where: { deleted_at: null } },
            staff: { where: { is_active: true } },
          },
        },
      },
    });

    if (!retailer) throw notFound('Retailer not found');

    // Get try-on usage this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [tryOnUsageThisMonth, tryOnUsageTotal] = await Promise.all([
      prisma.tryOnUsageLog.aggregate({
        where: { retailer_id: id, created_at: { gte: monthStart } },
        _sum: { cost_usd: true },
        _count: true,
      }),
      prisma.tryOnUsageLog.aggregate({
        where: { retailer_id: id },
        _sum: { cost_usd: true },
        _count: true,
      }),
    ]);

    // Get recent products
    const recentProducts = await prisma.product.findMany({
      where: { retailer_id: id, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        category: true,
        primary_color: true,
        price_min: true,
        status: true,
        created_at: true,
        _count: { select: { photos: true } },
      },
    });

    const { _count, ...retailerData } = retailer;

    return {
      data: {
        ...retailerData,
        product_count: _count.products,
        customer_count: _count.customers,
        collection_count: _count.collections,
        staff_count: _count.staff,
        try_on: {
          this_month: {
            count: tryOnUsageThisMonth._count,
            cost_usd: tryOnUsageThisMonth._sum.cost_usd ?? 0,
          },
          total: {
            count: tryOnUsageTotal._count,
            cost_usd: tryOnUsageTotal._sum.cost_usd ?? 0,
          },
        },
        recent_products: recentProducts,
      },
    };
  });

  // ─── POST /admin/retailers/:id/extend-trial ────────────────────
  // Extend a retailer's trial by N days.
  server.post('/retailers/:id/extend-trial', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body);

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
      select: { id: true, trial_ends_at: true },
    });
    if (!retailer) throw notFound('Retailer not found');

    const newEnd =
      retailer.trial_ends_at && retailer.trial_ends_at > new Date()
        ? new Date(retailer.trial_ends_at.getTime() + body.days * 86400000)
        : new Date(Date.now() + body.days * 86400000);

    await prisma.retailer.update({
      where: { id },
      data: { trial_ends_at: newEnd, plan_status: 'TRIAL' },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'EXTEND_TRIAL',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: {
          days_added: body.days,
          before: { trial_ends_at: retailer.trial_ends_at?.toISOString() ?? null },
          after: { trial_ends_at: newEnd.toISOString(), plan_status: 'TRIAL' },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, days: body.days, new_trial_end: newEnd }, 'Trial extended');

    return { data: { trial_ends_at: newEnd.toISOString(), plan_status: 'TRIAL' } };
  });

  // ─── POST /admin/retailers/:id/change-plan ─────────────────────
  // Change a retailer's plan and update limits.
  server.post('/retailers/:id/change-plan', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
        extend_trial_days: z.number().int().min(0).max(90).optional(),
      })
      .parse(request.body);

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
    });
    if (!retailer) throw notFound('Retailer not found');

    const limits: Record<string, { products: number; customers: number; try_on: number }> = {
      STARTER: { products: 500, customers: 999999, try_on: 0 },
      GROWTH: { products: 2000, customers: 999999, try_on: 100 },
      PRO: { products: 999999, customers: 999999, try_on: 500 },
    };

    const planLimits = limits[body.plan];
    if (!planLimits) throw notFound(`Plan ${body.plan} not found`);

    const updateData: Record<string, unknown> = {
      plan: body.plan,
      plan_status: body.status,
      max_products: planLimits.products,
      max_customers: planLimits.customers,
      try_on_credits: planLimits.try_on,
    };

    if (body.extend_trial_days && body.extend_trial_days > 0) {
      updateData.trial_ends_at = new Date(Date.now() + body.extend_trial_days * 86400000);
    }

    await prisma.retailer.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CHANGE_PLAN',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: {
          before: {
            plan: retailer.plan,
            plan_status: retailer.plan_status,
            trial_ends_at: retailer.trial_ends_at?.toISOString() ?? null,
          },
          after: updateData as Record<string, string | number | boolean | null>,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, plan: body.plan, status: body.status }, 'Plan changed');

    return { data: { plan: body.plan, plan_status: body.status, ...updateData } };
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

  // ─── GET /admin/plan-limits ─────────────────────────────────────
  // F-010: admin-configurable quota per plan/resource. Read-only for now
  // for retailer_limit_overrides — this screen manages plan-wide defaults.
  server.get('/plan-limits', async () => {
    const rows = await prisma.planLimit.findMany({
      orderBy: [{ plan: 'asc' }, { resource_type: 'asc' }],
    });
    return { data: rows };
  });

  // ─── PUT /admin/plan-limits ─────────────────────────────────────
  // Upsert one (plan, resource_type) row. Creates it if this is the first
  // time a resource is being limited (e.g. admin decides to start metering
  // API_REQUEST later) — checkQuota() treats a missing row as unlimited,
  // so this is also how a limit gets turned on for the first time.
  server.put('/plan-limits', async (request) => {
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ]),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
      })
      .parse(request.body);

    // Capture before-state for audit log
    const prevPlanLimit = await prisma.planLimit.findUnique({
      where: { plan_resource_type: { plan: body.plan, resource_type: body.resource_type } },
    });

    const row = await prisma.planLimit.upsert({
      where: { plan_resource_type: { plan: body.plan, resource_type: body.resource_type } },
      create: body,
      update: { limit_per_period: body.limit_per_period, period: body.period },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prevPlanLimit ? 'UPDATE' : 'CREATE',
        resource_type: 'PlanLimit',
        resource_id: `${body.plan}_${body.resource_type}`,
        metadata: {
          before: prevPlanLimit
            ? { limit_per_period: prevPlanLimit.limit_per_period, period: prevPlanLimit.period }
            : null,
          after: { limit_per_period: body.limit_per_period, period: body.period },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ plan: body.plan, resource_type: body.resource_type }, 'Plan limit updated');

    return { data: row };
  });

  // ─── GET /admin/plan-features ────────────────────────────────────
  // F-013: List all plan feature toggles across all plans.
  // Returns all rows, including F-010-style "missing means OFF" convention.
  server.get('/plan-features', async () => {
    const rows = await prisma.planFeature.findMany({
      orderBy: [{ plan: 'asc' }, { feature_key: 'asc' }],
    });
    return { data: rows };
  });

  // ─── PUT /admin/plan-features ────────────────────────────────────
  // F-013: Upsert one (plan, feature_key) toggle. Creates it if missing.
  // Fails CLOSED — a missing row means OFF, so this is how admin turns a
  // feature on for the first time.
  server.put('/plan-features', async (request) => {
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        feature_key: z.enum([
          'BULK_ONBOARDING_IMPORT',
          'CUSTOM_BACKGROUND_LIBRARY',
          'SPIN_360',
          'VIRTUAL_TRY_ON',
          'WHATSAPP_BUSINESS_API',
          'CHECKOUT_CART',
          'DATA_EXPORT_CSV',
          'CUSTOM_BRANDING',
          'GHOST_MANNEQUIN_AI',
          'RAZORPAY_ROUTE',
          'API_ACCESS',
          'PRIORITY_AI_QUEUE',
          'MULTI_STORE',
        ]),
        enabled: z.boolean(),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    // Capture before-state for audit log
    const prev = await prisma.planFeature.findUnique({
      where: { plan_feature_key: { plan: body.plan, feature_key: body.feature_key } },
    });

    const row = await prisma.planFeature.upsert({
      where: { plan_feature_key: { plan: body.plan, feature_key: body.feature_key } },
      create: {
        plan: body.plan,
        feature_key: body.feature_key,
        enabled: body.enabled,
        updated_by_id: body.updated_by_id,
      },
      update: {
        enabled: body.enabled,
        updated_by_id: body.updated_by_id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prev ? 'UPDATE' : 'CREATE',
        resource_type: 'PlanFeature',
        resource_id: `${body.plan}_${body.feature_key}`,
        metadata: {
          before: prev ? { enabled: prev.enabled } : null,
          after: { enabled: body.enabled, feature_key: body.feature_key },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { plan: body.plan, feature_key: body.feature_key, enabled: body.enabled },
      'Plan feature updated',
    );

    return { data: row };
  });

  // ─── GET /admin/plan-features/summary ────────────────────────────
  // F-013: Returns a summary of all features enabled per plan, grouped
  // by feature key with plan-enabled status. Useful for the frontend grid.
  server.get('/plan-features/summary', async () => {
    const rows = await prisma.planFeature.findMany({
      orderBy: [{ feature_key: 'asc' }, { plan: 'asc' }],
    });

    const byFeature = new Map<string, Record<string, boolean>>();
    for (const row of rows) {
      let plans = byFeature.get(row.feature_key);
      if (!plans) {
        plans = {};
        byFeature.set(row.feature_key, plans);
      }
      plans[row.plan] = row.enabled;
    }

    const summary = Array.from(byFeature.entries()).map(([feature_key, plans]) => ({
      feature_key,
      STARTER: plans.STARTER ?? false,
      GROWTH: plans.GROWTH ?? false,
      PRO: plans.PRO ?? false,
    }));

    return { data: summary };
  });

  // ─── GET /admin/catalog-upload-tiers ─────────────────────────────
  // F-019: admin-editable item-count-to-price tiers for the paid catalog
  // upload service. Same live-edit pattern as plan-features — no deploy
  // needed to change a price break.
  server.get('/catalog-upload-tiers', async () => {
    const tiers = await prisma.catalogUploadPriceTier.findMany({ orderBy: { min_items: 'asc' } });
    return { data: tiers };
  });

  // ─── POST /admin/catalog-upload-tiers ────────────────────────────
  server.post('/catalog-upload-tiers', async (request) => {
    const body = z
      .object({
        min_items: z.number().int().min(0),
        max_items: z.number().int().min(0).nullable().optional(),
        price_inr: z.number().int().min(0),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    const tier = await prisma.catalogUploadPriceTier.create({
      data: {
        min_items: body.min_items,
        max_items: body.max_items ?? null,
        price_inr: body.price_inr,
        updated_by_id: body.updated_by_id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'CatalogUploadPriceTier',
        resource_id: tier.id,
        metadata: {
          min_items: tier.min_items,
          max_items: tier.max_items,
          price_inr: tier.price_inr,
        },
        ip_address: request.ip,
      },
    });

    return { data: tier };
  });

  // ─── PATCH /admin/catalog-upload-tiers/:id ───────────────────────
  server.patch<{ Params: { id: string } }>('/catalog-upload-tiers/:id', async (request) => {
    const body = z
      .object({
        min_items: z.number().int().min(0).optional(),
        max_items: z.number().int().min(0).nullable().optional(),
        price_inr: z.number().int().min(0).optional(),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    const tier = await prisma.catalogUploadPriceTier
      .update({ where: { id: request.params.id }, data: body })
      .catch(() => null);
    if (!tier) throw notFound('Catalog upload price tier');

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'CatalogUploadPriceTier',
        resource_id: tier.id,
        metadata: {
          min_items: tier.min_items,
          max_items: tier.max_items,
          price_inr: tier.price_inr,
        },
        ip_address: request.ip,
      },
    });

    return { data: tier };
  });

  // ─── DELETE /admin/catalog-upload-tiers/:id ──────────────────────
  server.delete<{ Params: { id: string } }>('/catalog-upload-tiers/:id', async (request, reply) => {
    await prisma.catalogUploadPriceTier
      .delete({ where: { id: request.params.id } })
      .catch(() => null);
    return reply.status(204).send();
  });

  // ─── GET /admin/retailers/:id/activity ──────────────────────────
  // F-014: AuditLog entries for a specific retailer, most recent first.
  // Includes both retailer actions and admin actions on this retailer.
  server.get('/retailers/:id/activity', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .safeParse(request.query);
    const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 30 };

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          OR: [{ resource_type: 'Retailer', resource_id: id }, { resource_id: id }],
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      prisma.auditLog.count({
        where: {
          OR: [{ resource_type: 'Retailer', resource_id: id }, { resource_id: id }],
        },
      }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
  });

  // ─── GET /admin/retailers/:id/customers/:customerId/activity ─────
  // F-014: CustomerInteraction timeline for a specific customer.
  // Reuses existing F-008 data — no new schema needed.
  server.get('/retailers/:id/customers/:customerId/activity', async (request) => {
    const { id, customerId } = z
      .object({ id: z.string(), customerId: z.string() })
      .parse(request.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .safeParse(request.query);
    const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 30 };

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, retailer_id: id, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw notFound('Customer');

    const [interactions, totalCount] = await Promise.all([
      prisma.customerInteraction.findMany({
        where: {
          customer_id: customerId,
          retailer_id: id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        include: {
          product: { select: { id: true, name: true, category: true, price_min: true } },
        },
      }),
      prisma.customerInteraction.count({
        where: { customer_id: customerId, retailer_id: id },
      }),
    ]);

    const hasMore = interactions.length > limit;
    const page = hasMore ? interactions.slice(0, limit) : interactions;

    return {
      data: {
        customer,
        interactions: page,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
  });

  // ─── GET /admin/activity ────────────────────────────────────────
  // F-014: Platform-wide activity feed with burst detection.
  // Shows recent AuditLog entries across all resources with a simple
  // threshold check: if the same action/resource_type pair from the
  // same actor appears >20 times in the last hour, it's flagged as a burst.
  server.get('/activity', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        actor_type: z.string().max(50).optional(),
        action: z.string().max(100).optional(),
        resource_type: z.string().max(100).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, actor_type, action, resource_type, date_from, date_to } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          actor_type: undefined,
          action: undefined,
          resource_type: undefined,
          date_from: undefined,
          date_to: undefined,
        };

    const where: Record<string, unknown> = {};
    if (cursor) where.id = { lt: cursor };
    if (actor_type) where.actor_type = { equals: actor_type, mode: 'insensitive' as const };
    if (action) where.action = action;
    if (resource_type)
      where.resource_type = { equals: resource_type, mode: 'insensitive' as const };
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    // Burst detection: count grouped by (action, resource_type, actor_type) in the last hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const [burstGroups, logs, totalCount] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['action', 'resource_type', 'actor_type'],
        where: { created_at: { gte: oneHourAgo } },
        _count: true,
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    // Flag bursts: when the same (action, resource_type, actor_type) appears >20 times in the last hour
    const bursts = burstGroups
      .filter((g) => g._count > 20)
      .map((g) => ({
        action: g.action,
        resource_type: g.resource_type,
        actor_type: g.actor_type,
        count: g._count,
        threshold: 20,
        flagged: g._count > 20,
      }));

    return {
      data: {
        logs: page,
        bursts,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
  });

  // ─── GET /admin/retailers/:id/overrides ─────────────────────────
  // F-010: List per-retailer limit overrides for a specific retailer.
  server.get('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    const overrides = await prisma.retailerLimitOverride.findMany({
      where: { retailer_id: id },
      orderBy: { resource_type: 'asc' },
    });
    return { data: overrides };
  });

  // ─── POST /admin/retailers/:id/overrides ────────────────────────
  // F-010: Create or update a per-retailer limit override.
  server.post('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ]),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
        reason: z.string().max(200).optional(),
      })
      .parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    // Capture before-state for audit log
    const prevOverride = await prisma.retailerLimitOverride.findUnique({
      where: { retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type } },
    });

    const override = await prisma.retailerLimitOverride.upsert({
      where: {
        retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type },
      },
      create: { retailer_id: id, ...body },
      update: { limit_per_period: body.limit_per_period, period: body.period, reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prevOverride ? 'UPDATE' : 'CREATE',
        resource_type: 'RetailerLimitOverride',
        resource_id: override.id,
        metadata: {
          retailer_id: id,
          before: prevOverride
            ? {
                limit_per_period: prevOverride.limit_per_period,
                period: prevOverride.period,
                reason: prevOverride.reason,
              }
            : null,
          after: {
            resource_type: body.resource_type,
            limit_per_period: body.limit_per_period,
            period: body.period,
            reason: body.reason ?? null,
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, resource_type: body.resource_type }, 'Override set');
    return { data: override };
  });

  // ─── DELETE /admin/retailers/:id/overrides/:overrideId ───────────
  // F-010: Remove a per-retailer limit override, falling back to plan default.
  server.delete('/retailers/:id/overrides/:overrideId', async (request, reply) => {
    const { id, overrideId } = z
      .object({ id: z.string(), overrideId: z.string() })
      .parse(request.params);

    const existing = await prisma.retailerLimitOverride.findFirst({
      where: { id: overrideId, retailer_id: id },
    });
    if (!existing) throw notFound('Override');

    await prisma.retailerLimitOverride.delete({ where: { id: overrideId } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'RetailerLimitOverride',
        resource_id: overrideId,
        metadata: {
          retailer_id: id,
          before: {
            resource_type: existing.resource_type,
            limit_per_period: existing.limit_per_period,
            period: existing.period,
            reason: existing.reason,
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { retailer_id: id, resource_type: existing.resource_type },
      'Override removed',
    );
    return reply.status(204).send();
  });

  // ─── GET /admin/addon-purchases ────────────────────────────────
  // F-010 Phase 3: monitoring for self-serve addon purchases.
  // Returns completed purchases with retailer info, total revenue,
  // top buyers, and breakdown by resource type.
  server.get('/addon-purchases', async () => {
    const [completedPurchases, revenueAgg, topBuyers, resourceBreakdown] = await Promise.all([
      // All completed purchases with retailer info, last 90 days
      prisma.quotaAddonPurchase.findMany({
        where: {
          status: 'COMPLETED',
          created_at: { gte: new Date(Date.now() - 90 * 86400000) },
        },
        orderBy: { created_at: 'desc' },
        take: 200,
        include: {
          retailer: {
            select: { id: true, shop_name: true, city: true, phone: true, plan: true },
          },
        },
      }),
      // Total revenue from all completed addon purchases
      prisma.quotaAddonPurchase.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true },
        _count: true,
      }),
      // Top buyers (group by retailer)
      prisma.quotaAddonPurchase.groupBy({
        by: ['retailer_id'],
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true, quantity: true },
        _count: true,
        orderBy: { _sum: { amount_inr: 'desc' } },
        take: 20,
      }),
      // Breakdown by resource type
      prisma.quotaAddonPurchase.groupBy({
        by: ['resource_type'],
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true, quantity: true },
        _count: true,
        orderBy: { _sum: { amount_inr: 'desc' } },
      }),
    ]);

    // Enrich top buyers with retailer info
    const buyerRetailerIds = topBuyers.map((b) => b.retailer_id);
    const buyerRetailers = await prisma.retailer.findMany({
      where: { id: { in: buyerRetailerIds } },
      select: { id: true, shop_name: true, city: true, phone: true, plan: true },
    });
    const retailerMap = new Map(buyerRetailers.map((r) => [r.id, r]));

    const enrichedTopBuyers = topBuyers.map((b) => ({
      retailer_id: b.retailer_id,
      retailer: retailerMap.get(b.retailer_id) ?? null,
      total_spent_inr: b._sum.amount_inr ?? 0,
      total_quantity: b._sum.quantity ?? 0,
      purchase_count: b._count,
    }));

    return {
      data: {
        recent_purchases: completedPurchases.map((p) => ({
          id: p.id,
          retailer_id: p.retailer_id,
          retailer: p.retailer,
          resource_type: p.resource_type,
          quantity: p.quantity,
          amount_inr: p.amount_inr,
          completed_at: p.completed_at,
          created_at: p.created_at,
        })),
        summary: {
          total_revenue_inr: revenueAgg._sum.amount_inr ?? 0,
          total_purchases: revenueAgg._count,
        },
        top_buyers: enrichedTopBuyers,
        resource_breakdown: resourceBreakdown.map((r) => ({
          resource_type: r.resource_type,
          total_revenue_inr: r._sum.amount_inr ?? 0,
          total_quantity: r._sum.quantity ?? 0,
          purchase_count: r._count,
        })),
      },
    };
  });

  // ─── GET /admin/usage ──────────────────────────────────────────
  // Platform-wide usage stats including try-on and revenue.
  server.get('/usage', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [tryOnUsage, activeSubscriptions, trialCount, totalRetailers] = await Promise.all([
      prisma.tryOnUsageLog.aggregate({
        where: { created_at: { gte: monthStart } },
        _sum: { cost_usd: true },
        _count: true,
      }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        select: { amount_inr: true, billing_period: true },
      }),
      prisma.retailer.count({ where: { plan_status: 'TRIAL', deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null } }),
    ]);

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const monthlyAmount = sub.billing_period === 'annual' ? sub.amount_inr / 12 : sub.amount_inr;
      return sum + monthlyAmount;
    }, 0);

    return {
      data: {
        total_retailers: totalRetailers,
        trial_retailers: trialCount,
        active_subscriptions: activeSubscriptions.length,
        mrr_inr: Math.round(mrr),
        try_on_this_month: tryOnUsage._count,
        try_on_cost_usd: tryOnUsage._sum.cost_usd ?? 0,
      },
    };
  });

  // ─── GET /admin/background-images ───────────────────────────────
  // F-011: full library incl. inactive rows (admin needs to see what's
  // hidden from the retailer picker in order to re-activate it).
  server.get('/background-images', async () => {
    const rows = await prisma.backgroundImage.findMany({ orderBy: { created_at: 'desc' } });
    return { data: rows };
  });

  // ─── POST /admin/background-images/upload-url ───────────────────
  // Presigned PUT so the admin panel uploads image bytes straight to R2,
  // same pattern as the retailer spin-video upload (products.ts).
  server.post('/background-images/upload-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);

    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.backgroundImage(
      `${createHash('sha256')
        .update(body.filename + Date.now())
        .digest('hex')
        .slice(0, 16)}.${ext}`,
    );
    const uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);

    return {
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    };
  });

  // ─── POST /admin/background-images ───────────────────────────────
  // Registers a background already uploaded via the presigned URL above.
  server.post('/background-images', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        image_url: z.string().url(),
        thumbnail_url: z.string().url().optional(),
      })
      .parse(request.body);

    const row = await prisma.backgroundImage.create({ data: body });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'BackgroundImage',
        resource_id: row.id,
        metadata: { name: row.name, image_url: row.image_url },
        ip_address: request.ip,
      },
    });

    return { data: row };
  });

  // ─── PATCH /admin/background-images/:id ──────────────────────────
  // Toggle visibility in the retailer picker or rename. No hard delete —
  // products may already reference a row (background_image_id FK is
  // ON DELETE SET NULL), so deactivating keeps existing selections intact
  // while hiding it from new picks.
  server.patch('/background-images/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.backgroundImage.findUnique({ where: { id } });
    if (!existing) throw notFound('Background image');

    const row = await prisma.backgroundImage.update({ where: { id }, data: body });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'BackgroundImage',
        resource_id: id,
        metadata: {
          before: { name: existing.name, is_active: existing.is_active },
          after: {
            ...(body.name ? { name: body.name } : {}),
            ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
          },
        },
        ip_address: request.ip,
      },
    });

    return { data: row };
  });

  // ─── GET /admin/audit-logs ───────────────────────────────────
  // SECURITY §18: View the audit trail with filtering and pagination.
  // Returns most recent entries first. Filters are optional.
  server.get('/audit-logs', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        action: z.string().max(100).optional(),
        actor_type: z.string().max(50).optional(),
        actor_id: z.string().optional(),
        resource_type: z.string().max(100).optional(),
        resource_id: z.string().optional(),
        ip_address: z.string().max(50).optional(),
        date_from: z.string().optional(), // ISO date string
        date_to: z.string().optional(), // ISO date string
      })
      .safeParse(request.query);

    const {
      cursor,
      limit,
      action,
      actor_type,
      actor_id,
      resource_type,
      resource_id,
      ip_address,
      date_from,
      date_to,
    } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          action: undefined,
          actor_type: undefined,
          actor_id: undefined,
          resource_type: undefined,
          resource_id: undefined,
          ip_address: undefined,
          date_from: undefined,
          date_to: undefined,
        };

    const where: Record<string, unknown> = {};
    if (cursor) where.id = { lt: cursor };
    if (action) where.action = { contains: action, mode: 'insensitive' as const };
    if (actor_type) where.actor_type = { equals: actor_type, mode: 'insensitive' as const };
    if (actor_id) where.actor_id = actor_id;
    if (resource_type)
      where.resource_type = { equals: resource_type, mode: 'insensitive' as const };
    if (resource_id) where.resource_id = resource_id;
    if (ip_address) where.ip_address = { contains: ip_address };
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── POST /admin/query ─────────────────────────────────────────────
  // SECURITY §14: Admin read-only SQL query console. Runs against the
  // read-replica (DATABASE_URL_REPLICA) — NEVER against the primary DB.
  // Only SELECT, EXPLAIN, and WITH queries are permitted.
  // All queries are logged to the audit trail.
  server.post('/query', async (request) => {
    const body = z.object({ query: z.string().min(1).max(10000) }).parse(request.body);

    const sql = body.query.trim();

    // ── Read-only enforcement ─────────────────────────────────────
    // Strip leading SQL comments (-- and /* */)
    const stripped = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*\s*/m, '').trim();
    const firstWord = stripped.split(/[\s(]/)[0]?.toUpperCase() ?? '';

    const READ_ONLY_STATEMENTS = ['SELECT', 'EXPLAIN', 'WITH'];
    if (!READ_ONLY_STATEMENTS.includes(firstWord)) {
      throw validationError(
        `Only SELECT, EXPLAIN, and WITH queries are allowed (got "${firstWord}")`,
      );
    }

    // Block multi-statement queries (semicolons outside string literals)
    // Simple heuristic: count semicolons that aren't inside quotes
    const strippedQuotes = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    const semicolonCount = (strippedQuotes.match(/;/g) ?? []).length;
    if (semicolonCount > 1) {
      throw validationError('Multi-statement queries are not allowed');
    }

    // ── Execute on replica ─────────────────────────────────────────
    const replica = getReplicaPrisma();
    const start = performance.now();

    let rows: unknown[];
    try {
      // Timeout via Promise.race — 30 seconds max
      // Timer is cleaned up via .finally() to avoid dangling timeout handles
      let timer: NodeJS.Timeout | undefined;
      const timerPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Query timed out after 30 seconds')), 30000);
      });
      const result = (await Promise.race([replica.$queryRawUnsafe(sql), timerPromise]).finally(() =>
        clearTimeout(timer),
      )) as unknown[];

      rows = Array.isArray(result) ? result : [result];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query execution failed';
      request.log.warn({ query: sql.slice(0, 200) }, `Admin query failed: ${message}`);

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'QUERY_ERROR',
          resource_type: 'DatabaseQuery',
          metadata: {
            query_preview: sql.slice(0, 500),
            error: message.slice(0, 500),
            execution_time_ms: Math.round(performance.now() - start),
          },
          ip_address: request.ip,
        },
      });

      return {
        data: {
          error: message,
          execution_time_ms: Math.round(performance.now() - start),
        },
      };
    }

    const elapsed = Math.round(performance.now() - start);
    const MAX_ROWS = 1000;
    const truncated = rows.length > MAX_ROWS;
    const displayRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
    const columns =
      displayRows.length > 0 ? Object.keys(displayRows[0] as Record<string, unknown>) : [];

    // ── Audit log ──────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'QUERY',
        resource_type: 'DatabaseQuery',
        metadata: {
          query_preview: sql.slice(0, 500),
          row_count: rows.length,
          truncated,
          execution_time_ms: elapsed,
          column_count: columns.length,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ row_count: rows.length, elapsed }, 'Admin query executed');

    return {
      data: {
        columns,
        rows: displayRows,
        row_count: rows.length,
        truncated,
        execution_time_ms: elapsed,
      },
    };
  });

  // ─── GET /admin/schema ─────────────────────────────────────────────
  // Fetch database schema (tables, columns, types) from information_schema.
  // Used by the Query Console's Schema Explorer sidebar.
  server.get('/schema', async (_request) => {
    const replica = getReplicaPrisma();

    interface SchemaRow {
      table_schema: string;
      table_name: string;
      table_type: string;
      column_name: string | null;
      data_type: string | null;
      is_nullable: string | null;
      column_default: string | null;
      is_primary_key: boolean;
      ordinal_position: number | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
    }

    const rows = await replica.$queryRawUnsafe<SchemaRow[]>(`
      SELECT
        t.table_schema,
        t.table_name,
        t.table_type,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        (pk.column_name IS NOT NULL) AS is_primary_key,
        c.ordinal_position,
        c.character_maximum_length,
        c.numeric_precision
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c
        ON c.table_schema = t.table_schema
        AND c.table_name = t.table_name
      LEFT JOIN (
        SELECT ku.table_schema, ku.table_name, ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON ku.constraint_name = tc.constraint_name
          AND ku.table_schema = tc.table_schema
          AND ku.table_name = tc.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk
        ON pk.table_schema = t.table_schema
        AND pk.table_name = t.table_name
        AND pk.column_name = c.column_name
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name, c.ordinal_position
    `);

    // Group by schema → table → columns
    const schemaMap = new Map<
      string,
      {
        schema_name: string;
        tables: Map<
          string,
          {
            table_name: string;
            table_type: string;
            columns: Array<{
              column_name: string;
              data_type: string | null;
              is_nullable: boolean;
              column_default: string | null;
              is_primary_key: boolean;
              ordinal_position: number | null;
              character_maximum_length: number | null;
              numeric_precision: number | null;
            }>;
            column_count: number;
          }
        >;
        table_count: number;
      }
    >();

    for (const row of rows) {
      if (!row.table_schema || !row.table_name) continue;

      let schemaEntry = schemaMap.get(row.table_schema);
      if (!schemaEntry) {
        schemaEntry = { schema_name: row.table_schema, tables: new Map(), table_count: 0 };
        schemaMap.set(row.table_schema, schemaEntry);
      }

      let tableEntry = schemaEntry.tables.get(row.table_name);
      if (!tableEntry) {
        tableEntry = {
          table_name: row.table_name,
          table_type: row.table_type ?? 'BASE TABLE',
          columns: [],
          column_count: 0,
        };
        schemaEntry.tables.set(row.table_name, tableEntry);
      }

      if (row.column_name) {
        tableEntry.columns.push({
          column_name: row.column_name,
          data_type: row.data_type,
          is_nullable: row.is_nullable === 'YES',
          column_default: row.column_default,
          is_primary_key: row.is_primary_key,
          ordinal_position: row.ordinal_position,
          character_maximum_length: row.character_maximum_length,
          numeric_precision: row.numeric_precision,
        });
        tableEntry.column_count = tableEntry.columns.length;
      }
    }

    // Convert maps to plain arrays for JSON serialization
    const schemas = Array.from(schemaMap.values())
      .map((s) => ({
        ...s,
        tables: Array.from(s.tables.values())
          .map((t) => ({
            ...t,
            columns: t.columns.sort(
              (a, b) => (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0),
            ),
          }))
          .sort((a, b) => a.table_name.localeCompare(b.table_name)),
      }))
      .sort((a, b) => a.schema_name.localeCompare(b.schema_name));

    const total_tables = schemas.reduce((sum, s) => sum + s.table_count, 0);
    const total_columns = schemas.reduce(
      (sum, s) => sum + s.tables.reduce((tsum, t) => tsum + t.column_count, 0),
      0,
    );

    return {
      data: {
        schemas,
        summary: {
          total_schemas: schemas.length,
          total_tables,
          total_columns,
        },
      },
    };
  });

  // ─── GET /admin/integrations ─────────────────────────────────────
  // F-012: super-admin-only credential vault. Values are never returned —
  // only masked_preview. Every catalog key not yet configured here is
  // listed as "not_set" (falling back to its .env var at call time).
  server.get('/integrations', async () => {
    const rows = await prisma.integrationSetting.findMany({ orderBy: { key_name: 'asc' } });
    const byKey = new Map(rows.map((r) => [r.key_name, r]));

    const catalog = INTEGRATION_KEYS.map(({ key_name, category, label }: IntegrationKeyEntry) => {
      const row = byKey.get(key_name);
      return row
        ? {
            id: row.id,
            key_name: row.key_name,
            category: row.category,
            label: row.label,
            masked_preview: row.masked_preview,
            is_active: row.is_active,
            updated_at: row.updated_at,
            configured: true,
          }
        : {
            id: null,
            key_name,
            category,
            label,
            masked_preview: null,
            is_active: false,
            updated_at: null,
            configured: false,
          };
    });

    return { data: catalog };
  });

  // ─── POST /admin/integrations ─────────────────────────────────────
  // Create a credential row. Fails if key_name is already configured —
  // use PATCH to rotate an existing one (never-reveal: there is no way to
  // read the old value back, so this is a deliberate two-endpoint split).
  server.post('/integrations', async (request) => {
    const body = z
      .object({
        key_name: z.enum(
          INTEGRATION_KEYS.map((k: IntegrationKeyEntry) => k.key_name) as [string, ...string[]],
        ),
        value: z.string().min(1).max(2000),
      })
      .parse(request.body);

    const known = INTEGRATION_KEYS.find((k: IntegrationKeyEntry) => k.key_name === body.key_name);
    if (!known) throw validationError('Unknown integration key', 'key_name');

    const existing = await prisma.integrationSetting.findUnique({
      where: { key_name: body.key_name },
    });
    if (existing) throw validationError('Already configured — use PATCH to update', 'key_name');

    const row = await prisma.integrationSetting.create({
      data: {
        key_name: known.key_name,
        category: known.category,
        label: known.label,
        encrypted_value: encryptSecret(body.value),
        masked_preview: maskSecret(body.value),
      },
    });
    invalidateSecret(known.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'IntegrationSetting',
        resource_id: known.key_name,
        metadata: { category: known.category, label: known.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: known.key_name }, 'Integration setting created');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── PATCH /admin/integrations/:id ─────────────────────────────────
  // Rotate the value and/or toggle is_active. Never returns the value.
  server.patch('/integrations/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        value: z.string().min(1).max(2000).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    const row = await prisma.integrationSetting.update({
      where: { id },
      data: {
        ...(body.value !== undefined
          ? { encrypted_value: encryptSecret(body.value), masked_preview: maskSecret(body.value) }
          : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      },
    });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { rotated_value: body.value !== undefined, is_active: row.is_active },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting updated');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── DELETE /admin/integrations/:id ────────────────────────────────
  // Removes the DB override — the app falls back to the .env var of the
  // same name (getSecret()), it does not disable the integration outright.
  server.delete('/integrations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    await prisma.integrationSetting.delete({ where: { id } });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { category: existing.category, label: existing.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting deleted');
    return reply.status(204).send();
  });

  // ─── Backup Management ─────────────────────────────────────────────
  // SECURITY §13: Backups are stored in R2 under the `backups/` prefix.
  // Each backup has a .sql.gz file and a companion .meta.json file.
  //
  // Because pg_dump requires Docker (not available in the Railway runtime),
  // actual backup/restore execution happens via the CLI scripts:
  //   pnpm db:backup
  //   pnpm db:restore --backup-key <key>
  // The API endpoints manage listing, metadata, and audit logging.

  /** Helper: create an S3 client for R2 using env vars (same pattern as scripts/). */
  function createBackupR2Client(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw validationError('R2_ACCOUNT_ID not configured');
    return new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  /** Helper: read a JSON object from R2. */
  async function getR2Json(key: string): Promise<Record<string, unknown> | null> {
    const r2 = createBackupR2Client();
    const bucket = process.env.R2_BUCKET_NAME ?? 'kanchuki-prod';
    try {
      const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await response.Body?.transformToString();
      return body ? (JSON.parse(body) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** Helper: format bytes to human-readable string */
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // ─── GET /admin/backups ──────────────────────────────────────────
  // SECURITY §13: List all backups stored in R2 with metadata.
  server.get('/backups', async (_request) => {
    const r2 = createBackupR2Client();
    const bucket = process.env.R2_BUCKET_NAME ?? 'kanchuki-prod';

    // Paginate through all objects (S3/R2 returns max 1000 per page)
    const allObjects: { Key?: string; Size?: number; LastModified?: Date }[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'backups/',
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      if (response.Contents) allObjects.push(...response.Contents);
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    const objects = allObjects;

    // Group objects by backup (each backup has .sql.gz + .meta.json)
    const backupMap = new Map<
      string,
      {
        sql_gz: { key: string; size: number; last_modified: Date | undefined } | null;
        meta: Record<string, unknown> | null;
      }
    >();

    for (const obj of objects) {
      const key = obj.Key ?? '';
      if (key.endsWith('.meta.json')) {
        // Extract backup prefix (remove .meta.json)
        const prefix = key.slice(0, -'.meta.json'.length);
        let existing = backupMap.get(prefix);
        if (!existing) {
          existing = { sql_gz: null, meta: null };
          backupMap.set(prefix, existing);
        }
        // Try to read the metadata content
        const meta = await getR2Json(key);
        existing.meta = meta;
      } else if (key.endsWith('.sql.gz')) {
        const prefix = key.slice(0, -'.sql.gz'.length);
        let existing = backupMap.get(prefix);
        if (!existing) {
          existing = { sql_gz: null, meta: null };
          backupMap.set(prefix, existing);
        }
        existing.sql_gz = {
          key,
          size: obj.Size ?? 0,
          last_modified: obj.LastModified,
        };
      }
    }

    // Build backup list sorted by timestamp (newest first)
    const backups = Array.from(backupMap.entries())
      .flatMap(([prefix, v]) => {
        const sqlGz = v.sql_gz;
        if (!sqlGz) return []; // Only include entries with actual backup files
        return [
          {
            prefix,
            key: sqlGz.key,
            size: sqlGz.size,
            size_formatted: formatBytes(sqlGz.size),
            last_modified: sqlGz.last_modified?.toISOString() ?? null,
            metadata: v.meta,
            has_metadata: v.meta !== null,
          },
        ];
      })
      .sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''));

    // Calculate summary stats
    const total_size = backups.reduce((sum, b) => sum + b.size, 0);
    const latest_backup = backups.length > 0 ? backups[0] : null;

    return {
      data: {
        backups,
        summary: {
          total_count: backups.length,
          total_size,
          total_size_formatted: formatBytes(total_size),
          latest_backup: latest_backup
            ? {
                key: latest_backup.key,
                size_formatted: latest_backup.size_formatted,
                last_modified: latest_backup.last_modified,
                has_metadata: latest_backup.has_metadata,
              }
            : null,
        },
        environment: {
          docker_available: false, // Always false in Railway runtime
          backup_command: 'pnpm db:backup',
          restore_command: 'pnpm db:restore --backup-key <key>',
        },
      },
    };
  });

  // ─── POST /admin/backup/create ────────────────────────────────────
  // SECURITY §13: Trigger a backup. Logs the intent to the audit trail.
  // Actual execution requires the Docker-based CLI script.
  server.post('/backup/create', async (request) => {
    const body = z.object({ label: z.string().max(100).optional() }).safeParse(request.body);
    const label = body.success && body.data.label ? body.data.label : undefined;

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BACKUP_CREATE',
        resource_type: 'Database',
        metadata: {
          label: label ?? null,
          triggered_from: 'admin-ui',
          note: 'Backup requires Docker runtime. Run the CLI script manually: pnpm db:backup',
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ label }, 'Backup triggered from admin UI');

    return {
      data: {
        status: 'logged',
        message: 'Backup request logged. Execute the backup via CLI:',
        commands: [
          `pnpm db:backup${label ? ` --label "${label}"` : ''}`,
          '# Or with custom env: npx tsx scripts/backup-database.ts',
        ],
        cli_command: `pnpm db:backup${label ? ` --label "${label}"` : ''}`,
        audit_logged: true,
      },
    };
  });

  // ─── POST /admin/backups/:key/restore ─────────────────────────────
  // SECURITY §13: Trigger a restore from backup. Logs the intent.
  server.post('/backups/restore', async (request) => {
    const body = z
      .object({ key: z.string().min(1), target: z.string().optional() })
      .parse(request.body);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BACKUP_RESTORE',
        resource_type: 'Database',
        metadata: {
          backup_key: body.key,
          target: body.target ?? 'primary',
          note: 'Restore requires Docker runtime. Run the CLI script manually: pnpm db:restore',
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ backup_key: body.key }, 'Restore triggered from admin UI');

    return {
      data: {
        status: 'logged',
        message: 'Restore request logged. Execute the restore via CLI:',
        commands: [
          `pnpm db:restore --backup-key "${body.key}"`,
          `# Or with custom target: pnpm db:restore --backup-key "${body.key}" --target "<db-url>"`,
        ],
        cli_command: `pnpm db:restore --backup-key "${body.key}"`,
        audit_logged: true,
      },
    };
  });

  // ─── GET /admin/backups/:key/metadata ─────────────────────────────
  // Fetch the .meta.json file for a specific backup.
  server.get('/backups/:key/metadata', async (request) => {
    const { key } = z.object({ key: z.string() }).parse(request.params);
    // The key is the .sql.gz path — derive the .meta.json path
    const metaKey = key.endsWith('.sql.gz')
      ? `${key.slice(0, -'.sql.gz'.length)}.meta.json`
      : `${key}.meta.json`;

    const meta = await getR2Json(metaKey);
    if (!meta) {
      return { data: { key: metaKey, metadata: null } };
    }

    return { data: { key: metaKey, metadata: meta } };
  });

  // ═══════════════════════════════════════════════════════════════
  // F-015: ACCOUNT SUSPENSION
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /admin/retailers/:id/suspend ──────────────────────────
  // Suspend a retailer account. Reason required.
  server.post('/retailers/:id/suspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (retailer.is_suspended) throw validationError('Retailer is already suspended');

    await prisma.retailer.update({
      where: { id },
      data: { is_suspended: true, suspended_at: new Date(), suspended_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'SUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { reason: body.reason, shop_name: retailer.shop_name },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, reason: body.reason }, 'Retailer suspended');
    return {
      data: {
        is_suspended: true,
        suspended_at: new Date().toISOString(),
        suspended_reason: body.reason,
      },
    };
  });

  // ─── POST /admin/retailers/:id/unsuspend ────────────────────────
  server.post('/retailers/:id/unsuspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (!retailer.is_suspended) throw validationError('Retailer is not suspended');

    await prisma.retailer.update({
      where: { id },
      data: {
        is_suspended: false,
        suspended_at: null,
        suspended_reason: null,
        suspended_by_id: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNSUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { shop_name: retailer.shop_name, was_reason: retailer.suspended_reason },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id }, 'Retailer unsuspended');
    return { data: { is_suspended: false } };
  });

  // ─── POST /admin/customers/:customerId/block ────────────────────
  server.post('/customers/:customerId/block', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (customer.is_blocked) throw validationError('Customer is already blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: true, blocked_at: new Date(), blocked_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: {
          reason: body.reason,
          customer_name: customer.name,
          retailer_id: customer.retailer_id,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId, reason: body.reason }, 'Customer blocked');
    return {
      data: { is_blocked: true, blocked_at: new Date().toISOString(), blocked_reason: body.reason },
    };
  });

  // ─── POST /admin/customers/:customerId/unblock ──────────────────
  server.post('/customers/:customerId/unblock', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (!customer.is_blocked) throw validationError('Customer is not blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: false, blocked_at: null, blocked_reason: null },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNBLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: { customer_name: customer.name },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId }, 'Customer unblocked');
    return { data: { is_blocked: false } };
  });

  // ─── GET /admin/deletion-vault ───────────────────────────────────
  // F-016: View vault entries (read-only). Searchable by source_table,
  // source_id, or retailer_id. Paginated with cursor-based pagination.
  // Returns vault entries sorted by deleted_at descending.
  server.get('/deletion-vault', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        source_table: z.string().max(100).optional(),
        source_id: z.string().max(100).optional(),
        retailer_id: z.string().max(100).optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, source_table, source_id, retailer_id } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          source_table: undefined,
          source_id: undefined,
          retailer_id: undefined,
        };

    // Build where clause dynamically
    const where: Record<string, unknown> = {};
    if (source_table) where.source_table = { equals: source_table, mode: 'insensitive' as const };
    if (source_id) where.source_id = { contains: source_id, mode: 'insensitive' as const };
    if (retailer_id) where.retailer_id = { equals: retailer_id, mode: 'insensitive' as const };
    if (cursor) where.id = { lt: cursor };

    // Query the vault database (separate Postgres instance)
    const vault = await getVaultPrisma();
    if (!vault) {
      return {
        data: { entries: [], total_count: 0, vault_configured: false },
      };
    }

    const [entries, totalCount] = await Promise.all([
      vault.deletedRecord.findMany({
        where,
        orderBy: { deleted_at: 'desc' },
        take: limit + 1,
      }),
      vault.deletedRecord.count({ where }),
    ]);

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;

    return {
      data: {
        entries: page.map((entry: Record<string, unknown>) => ({
          id: entry.id,
          source_table: entry.source_table,
          source_id: entry.source_id,
          retailer_id: entry.retailer_id,
          payload: entry.payload,
          delete_reason: entry.delete_reason,
          deleted_by: entry.deleted_by,
          deleted_at: entry.deleted_at,
        })),
        total_count: totalCount,
        vault_configured: true,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── GET /admin/database/status ───────────────────────────────────
  // Database Health Dashboard — shows primary DB stats, replica lag,
  // backup info, and vault DB status. All queries are read-only and
  // run against the primary or replica as appropriate.
  server.get('/database/status', async (_request) => {
    // ── Primary DB stats ──────────────────────────────────────────
    interface DbStat {
      server_version: string;
      active_connections: bigint;
      max_connections: bigint;
      database_size: string;
      cache_hit_ratio: number;
      uptime_seconds: bigint;
      xact_total: bigint;
      xact_commit: bigint;
      xact_rollback: bigint;
      deadlocks: bigint;
      temp_files: bigint;
      temp_bytes: string;
    }

    let primary: DbStat | null = null;
    let primaryError: string | null = null;

    try {
      const result = await prisma.$queryRawUnsafe<DbStat[]>(`
        SELECT
          version() AS server_version,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active_connections,
          (SELECT setting::bigint FROM pg_settings WHERE name = 'max_connections') AS max_connections,
          pg_size_pretty(pg_database_size(current_database())) AS database_size,
          (
            SELECT round(
              (1 - (blks_read::numeric / NULLIF(COALESCE(blks_hit, 0) + COALESCE(blks_read, 0), 0))) * 100,
              2
            )
            FROM pg_stat_database
            WHERE datname = current_database()
          ) AS cache_hit_ratio,
          extract(epoch FROM now() - pg_postmaster_start_time())::bigint AS uptime_seconds,
          (SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS xact_total,
          (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()) AS xact_commit,
          (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS xact_rollback,
          (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) AS deadlocks,
          (SELECT temp_files FROM pg_stat_database WHERE datname = current_database()) AS temp_files,
          pg_size_pretty((SELECT COALESCE(temp_bytes, 0) FROM pg_stat_database WHERE datname = current_database())) AS temp_bytes
        FROM pg_stat_bgwriter
        LIMIT 1
      `);
      primary = result[0] ?? null;
    } catch (err) {
      primaryError = err instanceof Error ? err.message : 'Unknown error querying primary DB';
    }

    // ── Replica lag ───────────────────────────────────────────────
    let replica: {
      connected: boolean;
      lag_bytes: bigint | null;
      lag_seconds: number | null;
      error: string | null;
    } | null = null;

    try {
      const replicaPrisma = getReplicaPrisma();
      const result = await replicaPrisma.$queryRawUnsafe<
        {
          application_name: string;
          state: string;
          write_lag: number | null;
          flush_lag: number | null;
          replay_lag: number | null;
        }[]
      >(`
        SELECT
          application_name,
          state,
          write_lag,
          flush_lag,
          replay_lag
        FROM pg_stat_replication
        LIMIT 5
      `);

      const wal = result[0];
      if (wal) {
        // Use the largest lag value in seconds, or null
        const lagSeconds = Math.max(wal.write_lag ?? 0, wal.flush_lag ?? 0, wal.replay_lag ?? 0);
        replica = {
          connected: wal.state === 'streaming',
          lag_bytes: null, // not directly available from pg_stat_replication
          lag_seconds: lagSeconds > 0 ? lagSeconds : null,
          error: null,
        };
      } else {
        // No replicas configured — this is normal for a single-instance setup
        replica = { connected: false, lag_bytes: null, lag_seconds: null, error: null };
      }
    } catch (err) {
      replica = {
        connected: false,
        lag_bytes: null,
        lag_seconds: null,
        error: err instanceof Error ? err.message : 'Unknown replica error',
      };
    }

    // ── Backup info ───────────────────────────────────────────────
    // Read from R2 if possible, otherwise report unknown
    let backup: {
      latest_key: string | null;
      latest_age_hours: number | null;
      total_count: number;
      total_size_formatted: string;
    } | null = null;

    try {
      // First try to read from the backup metadata if we have an S3 client
      const r2 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '',
        },
      });

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? 'kanchuki-backups';

      // TODO: MaxKeys=100 will under-report count/size if 100+ backup files exist.
      // Increase or implement pagination once the project has many backups.
      const listResult = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'backups/',
          MaxKeys: 100,
        }),
      );

      const objects = (listResult.Contents ?? [])
        .filter((obj) => obj.Key?.endsWith('.sql.gz'))
        .sort((a, b) => {
          const aTime = a.LastModified?.getTime() ?? 0;
          const bTime = b.LastModified?.getTime() ?? 0;
          return bTime - aTime;
        });

      const totalSizeBytes = objects.reduce((sum, obj) => sum + (obj.Size ?? 0), 0);
      const latestBackup = objects[0] ?? null;

      backup = {
        latest_key: latestBackup?.Key?.split('/').pop()?.replace('.sql.gz', '') ?? null,
        latest_age_hours: latestBackup?.LastModified
          ? (Date.now() - latestBackup.LastModified.getTime()) / (1000 * 60 * 60)
          : null,
        total_count: objects.length,
        total_size_formatted:
          totalSizeBytes > 0
            ? totalSizeBytes >= 1073741824
              ? `${(totalSizeBytes / 1073741824).toFixed(1)} GB`
              : `${(totalSizeBytes / 1048576).toFixed(0)} MB`
            : '0 MB',
      };
    } catch {
      // R2 not configured or unavailable — report backup status as unknown
      backup = null;
    }

    // ── Vault DB status ───────────────────────────────────────────
    let vaultStatus: { connected: boolean; record_count: number } = {
      connected: false,
      record_count: 0,
    };

    try {
      const vault = await getVaultPrisma();
      if (vault) {
        const count = await vault.deletedRecord.count();
        vaultStatus = { connected: true, record_count: count };
      }
    } catch {
      vaultStatus = { connected: false, record_count: 0 };
    }

    // ── Guardrail migration status ────────────────────────────────
    let guardrailsActive = false;
    try {
      const result = await prisma.$queryRawUnsafe<
        { trigger_name: string; event_manipulation: string; event_object_table: string }[]
      >(`
        SELECT trigger_name, event_manipulation, event_object_table
        FROM information_schema.triggers
        WHERE trigger_name = 'prevent_hard_delete'
        LIMIT 1
      `);
      guardrailsActive = result.length > 0;
    } catch {
      guardrailsActive = false;
    }

    return {
      data: {
        primary: primary
          ? {
              server_version: primary.server_version.split(' ')[0] ?? primary.server_version,
              active_connections: Number(primary.active_connections),
              max_connections: Number(primary.max_connections),
              connection_usage_pct: Math.round(
                (Number(primary.active_connections) / Number(primary.max_connections)) * 100,
              ),
              database_size: primary.database_size,
              cache_hit_ratio: Number(primary.cache_hit_ratio),
              uptime_seconds: Number(primary.uptime_seconds),
              transactions: {
                committed: Number(primary.xact_commit),
                rolled_back: Number(primary.xact_rollback),
                total: Number(primary.xact_total),
              },
              deadlocks: Number(primary.deadlocks),
              temp_files: Number(primary.temp_files),
              temp_bytes: primary.temp_bytes,
              healthy: Number(primary.active_connections) < Number(primary.max_connections) * 0.8,
            }
          : { error: primaryError },
        replica,
        backup,
        vault: vaultStatus,
        guardrails: {
          active: guardrailsActive,
        },
      },
    };
  });

  // ─── AI Provider Registry (F-023) ───────────────────────────────
  // Admin-configurable list of tagging models the failover engine tries in
  // priority order. Each row = provider type + model + API key name + weighted
  // credit cost. Admin adds any OpenAI-protocol provider via OPENAI_COMPAT
  // + base_url (OpenRouter, DeepSeek, Mistral, Groq, ...).

  // ─── GET /admin/ai-providers ─────────────────────────────────────
  server.get('/ai-providers', async () => {
    const rows = await prisma.aiProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    });

    // Report whether each row's key is actually configured (DB or env), so
    // the admin UI can flag rows that will be skipped by the failover.
    const withKeyState = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        key_configured: !!(await getSecret(row.api_key_name)),
      })),
    );
    return { data: withKeyState };
  });

  // ─── POST /admin/ai-providers ────────────────────────────────────
  server.post('/ai-providers', async (request, reply) => {
    const body = z
      .object({
        provider_type: z.enum(['ANTHROPIC', 'OPENAI_COMPAT', 'GEMINI']),
        label: z.string().min(1).max(100),
        model_name: z.string().min(1).max(200),
        lite_model_name: z.string().max(200).nullable().optional(),
        base_url: z.string().url().nullable().optional(),
        api_key_name: z.string().min(1).max(100),
        priority: z.number().int().min(1).max(999).optional(),
        is_active: z.boolean().optional(),
        credits_per_call: z.number().int().min(1).max(100_000).default(1),
      })
      .parse(request.body);

    const row = await prisma.aiProviderConfig.create({
      data: {
        provider_type: body.provider_type,
        label: body.label,
        model_name: body.model_name,
        lite_model_name: body.lite_model_name ?? null,
        base_url: body.base_url ?? null,
        api_key_name: body.api_key_name,
        priority: body.priority ?? 1,
        is_active: body.is_active ?? true,
        credits_per_call: body.credits_per_call,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'AiProviderConfig',
        resource_id: row.id,
        metadata: {
          label: row.label,
          provider_type: row.provider_type,
          model_name: row.model_name,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: row.id, label: row.label }, 'AI provider created');
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/ai-providers/:id ───────────────────────────────
  server.patch<{ Params: { id: string } }>('/ai-providers/:id', async (request) => {
    const body = z
      .object({
        provider_type: z.enum(['ANTHROPIC', 'OPENAI_COMPAT', 'GEMINI']).optional(),
        label: z.string().min(1).max(100).optional(),
        model_name: z.string().min(1).max(200).optional(),
        lite_model_name: z.string().max(200).nullable().optional(),
        base_url: z.string().url().nullable().optional(),
        api_key_name: z.string().min(1).max(100).optional(),
        priority: z.number().int().min(1).max(999).optional(),
        is_active: z.boolean().optional(),
        credits_per_call: z.number().int().min(1).max(100_000).optional(),
      })
      .parse(request.body);

    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!existing) throw notFound('AI provider');

    const row = await prisma.aiProviderConfig.update({
      where: { id: request.params.id },
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AiProviderConfig',
        resource_id: row.id,
        metadata: { label: row.label, updated_fields: Object.keys(body) },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: row.id }, 'AI provider updated');
    return { data: row };
  });

  // ─── DELETE /admin/ai-providers/:id ──────────────────────────────
  server.delete<{ Params: { id: string } }>('/ai-providers/:id', async (request, reply) => {
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!existing) throw notFound('AI provider');

    await prisma.aiProviderConfig.delete({ where: { id: request.params.id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'AiProviderConfig',
        resource_id: request.params.id,
        metadata: { label: existing.label, provider_type: existing.provider_type },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: request.params.id }, 'AI provider deleted');
    return reply.status(204).send();
  });

  // ─── POST /admin/ai-providers/reorder ────────────────────────────
  // Accept an ordered list of ids; rewrites priority 1..N in that order.
  server.post('/ai-providers/reorder', async (request) => {
    const body = z.object({ ordered_ids: z.array(z.string()).min(1).max(100) }).parse(request.body);

    await prisma.$transaction(
      body.ordered_ids.map((id, index) =>
        prisma.aiProviderConfig.update({
          where: { id },
          data: { priority: index + 1 },
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AiProviderConfig',
        metadata: { reordered: body.ordered_ids },
        ip_address: request.ip,
      },
    });

    return { data: { reordered: body.ordered_ids.length } };
  });

  // ─── GET /admin/ai-usage ─────────────────────────────────────────
  // Per-retailer × per-provider AI usage aggregation (weighted credits).
  server.get('/ai-usage', async (request) => {
    const query = z
      .object({
        retailer_id: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
      .safeParse(request.query);
    const { retailer_id, date_from, date_to } = query.success ? query.data : {};

    const where: Record<string, unknown> = {};
    if (retailer_id) where.retailer_id = retailer_id;
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    const groups = await prisma.aiUsageLog.groupBy({
      by: ['retailer_id', 'provider_type', 'model_name', 'resource_type'],
      where,
      _sum: { credits_used: true },
      _count: { id: true },
      orderBy: { _sum: { credits_used: 'desc' } },
    });

    // Join retailer names for display
    const retailerIds = [...new Set(groups.map((g) => g.retailer_id))];
    const retailers = retailerIds.length
      ? await prisma.retailer.findMany({
          where: { id: { in: retailerIds } },
          select: { id: true, shop_name: true, city: true, plan: true },
        })
      : [];
    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    return {
      data: groups.map((g) => ({
        retailer_id: g.retailer_id,
        retailer_name: retailerMap.get(g.retailer_id)?.shop_name ?? null,
        city: retailerMap.get(g.retailer_id)?.city ?? null,
        plan: retailerMap.get(g.retailer_id)?.plan ?? null,
        provider_type: g.provider_type,
        model_name: g.model_name,
        resource_type: g.resource_type,
        calls: g._count.id,
        credits_used: g._sum.credits_used ?? 0,
      })),
    };
  });
};
