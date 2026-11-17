// Admin: Google Business Profile — shared identity connect + marketing link tool
// (docs/tasks/pending/google-business-profile-and-setup-checklist.md B3/B4).
//
// `gbp` is a STANDARD admin segment (marketing managers must reach the link tool); the
// credential-touching handlers (connect, callback, approval) call requireSuperAdmin
// themselves. Only these routes can ever set a link's Google account/location ids.
//
//   GET  /admin/gbp/status               connection + counts
//   GET  /admin/gbp/connect              Super Admin — Google consent URL
//   POST /admin/gbp/callback             Super Admin — exchange the code, store the token
//   POST /admin/gbp/approval             Super Admin — flip once Google approves API access
//   GET  /admin/gbp/links                retailers who asked / are linked
//   GET  /admin/gbp/locations            locations the shared identity manages, not yet linked
//   POST /admin/gbp/links/:id/link       pick one of those locations for the retailer
//   POST /admin/gbp/links/:id/unlink

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { syncLink } from '../../lib/gbp-sync.js';
import {
  GBP_KEYS,
  GbpError,
  __resetGbpTokenCache,
  buildAuthUrl,
  exchangeCode,
  gbpApiApproved,
  gbpConnectedEmail,
  getGbpSetting,
  listLocations,
  saveGbpSetting,
} from '../../lib/google-business.js';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler, requireSuperAdmin } from '../admin-auth.js';
import {
  consumeOAuthState,
  createOAuthState,
} from '../retailers/retailers-social/retailers-social-helpers.js';

const STATE_PREFIX = 'gbp-admin:';

function toAppError(err: GbpError): AppError {
  const status = err.code === 'UNAVAILABLE' ? 502 : 409;
  return new AppError(`GBP_${err.code}`, err.message, status);
}

const LinkBody = z.object({
  account: z.string().min(1).max(64),
  location: z.string().min(1).max(64),
});

export const adminGbpRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/gbp/status', async () => {
    const [email, approved, token, counts] = await Promise.all([
      gbpConnectedEmail(),
      gbpApiApproved(),
      getGbpSetting(GBP_KEYS.refreshToken),
      prisma.gbpLink.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      data: {
        connected: !!token,
        connected_email: email,
        api_approved: approved,
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      },
    };
  });

  server.get('/gbp/connect', async (request) => {
    requireSuperAdmin(request);
    try {
      const state = await createOAuthState(`${STATE_PREFIX}${request.adminId ?? 'admin'}`);
      return { data: { url: await buildAuthUrl(state) } };
    } catch (err) {
      if (err instanceof GbpError) throw toAppError(err);
      throw err;
    }
  });

  server.post('/gbp/callback', async (request) => {
    requireSuperAdmin(request);
    const body = z
      .object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(200) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Missing code or state');

    const bound = await consumeOAuthState(body.data.state);
    if (bound !== `${STATE_PREFIX}${request.adminId ?? 'admin'}`) {
      throw validationError('This Google sign-in expired or was not started by you. Try again.');
    }
    try {
      const { refreshToken, email } = await exchangeCode(body.data.code);
      await saveGbpSetting(
        GBP_KEYS.refreshToken,
        'Google Business Profile refresh token',
        refreshToken,
      );
      // No email in the id_token: store '' (read back as "none") rather than keep the PREVIOUS
      // account's address, which retailers would be told to add as Manager.
      await saveGbpSetting(GBP_KEYS.email, 'Google Business Profile account', email ?? '');
      __resetGbpTokenCache();
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: request.adminId ?? 'admin',
          action: 'connect',
          resource_type: 'Integration',
          resource_id: 'google_business_profile',
          metadata: { email },
          ip_address: request.ip,
        },
      });
      return { data: { connected: true, connected_email: email } };
    } catch (err) {
      if (err instanceof GbpError) throw toAppError(err);
      throw err;
    }
  });

  server.post('/gbp/approval', async (request) => {
    requireSuperAdmin(request);
    const body = z.object({ approved: z.boolean() }).safeParse(request.body);
    if (!body.success) throw validationError('approved must be true or false');
    await saveGbpSetting(
      GBP_KEYS.approved,
      'Google Business Profile API approved',
      String(body.data.approved),
    );
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        actor_id: request.adminId ?? 'admin',
        action: 'update',
        resource_type: 'Integration',
        resource_id: 'google_business_profile',
        metadata: { api_approved: body.data.approved },
        ip_address: request.ip,
      },
    });
    return { data: { api_approved: body.data.approved } };
  });

  server.get('/gbp/links', async () => {
    const links = await prisma.gbpLink.findMany({
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        location_title: true,
        consented_at: true,
        linked_at: true,
        last_synced_at: true,
        last_error_code: true,
        review_count: true,
        retailer: { select: { id: true, shop_name: true, city: true } },
      },
    });
    return { data: links };
  });

  server.get('/gbp/locations', async () => {
    try {
      const [all, taken] = await Promise.all([
        listLocations(),
        prisma.gbpLink.findMany({
          where: { gbp_location_id: { not: null } },
          select: { gbp_account_id: true, gbp_location_id: true },
        }),
      ]);
      const used = new Set(taken.map((t) => `${t.gbp_account_id}/${t.gbp_location_id}`));
      return { data: all.filter((l) => !used.has(`${l.account}/${l.location}`)) };
    } catch (err) {
      if (err instanceof GbpError) throw toAppError(err);
      throw err;
    }
  });

  server.post<{ Params: { id: string } }>('/gbp/links/:id/link', async (request) => {
    const body = LinkBody.safeParse(request.body);
    if (!body.success) throw validationError('Pick a Google location');
    const link = await prisma.gbpLink.findUnique({
      where: { id: request.params.id },
      select: { id: true, retailer_id: true, status: true },
    });
    if (!link) throw notFound('Link request');
    // No consent row, no link: a retailer who never asked cannot be linked by an agent.
    if (link.status === 'LINKED' || link.status === 'UNLINKED') {
      throw new AppError('INVALID_STATE', 'This retailer has not asked to be linked', 409);
    }

    // Never trust the client's ids: the location must be in what Google says we manage.
    let picked: { account: string; location: string; title: string } | undefined;
    try {
      picked = (await listLocations()).find(
        (l) => l.account === body.data.account && l.location === body.data.location,
      );
    } catch (err) {
      if (err instanceof GbpError) throw toAppError(err);
      throw err;
    }
    if (!picked) {
      throw validationError('That location is not managed by the Kanchuki Google account');
    }

    try {
      await prisma.gbpLink.update({
        where: { id: link.id },
        data: {
          status: 'LINKED',
          gbp_account_id: picked.account,
          gbp_location_id: picked.location,
          location_title: picked.title,
          linked_by_team_member_id: request.adminId ?? 'admin',
          linked_at: new Date(),
          unlinked_at: null,
          last_error_code: null,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new AppError(
          'ALREADY_LINKED',
          'That Google location is linked to another retailer',
          409,
        );
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        actor_id: request.adminId ?? 'admin',
        action: 'link',
        resource_type: 'GbpLink',
        resource_id: link.id,
        metadata: {
          retailer_id: link.retailer_id,
          account: picked.account,
          location: picked.location,
        },
        ip_address: request.ip,
      },
    });
    const result = await syncLink({
      id: link.id,
      retailer_id: link.retailer_id,
      gbp_account_id: picked.account,
      gbp_location_id: picked.location,
    });
    return { data: { linked: true, first_sync: result } };
  });

  server.post<{ Params: { id: string } }>('/gbp/links/:id/unlink', async (request) => {
    const link = await prisma.gbpLink.findUnique({
      where: { id: request.params.id },
      select: { id: true, retailer_id: true },
    });
    if (!link) throw notFound('Link');
    await prisma.gbpLink.update({
      where: { id: link.id },
      data: {
        status: 'UNLINKED',
        unlinked_at: new Date(),
        gbp_account_id: null,
        gbp_location_id: null,
        location_title: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        actor_id: request.adminId ?? 'admin',
        action: 'unlink',
        resource_type: 'GbpLink',
        resource_id: link.id,
        metadata: { retailer_id: link.retailer_id },
        ip_address: request.ip,
      },
    });
    return { data: { unlinked: true } };
  });
};
