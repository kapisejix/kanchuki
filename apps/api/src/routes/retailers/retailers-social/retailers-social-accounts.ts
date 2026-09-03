// retailers-social-accounts.ts — connected-account pick/store/list/disconnect (split from apps/api/src/routes/retailers/retailers-social.ts — body byte-identical)
import { encryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MetaApiError } from '../../../lib/meta-graph.js';
import { notFound, validationError } from '../../../plugins/error-handler.js';
import { getStateRedis } from './retailers-social-helpers.js';
export const retailersSocialAccountsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /retailers/me/social/accounts — store the chosen Page ──
  // The web picker posts { platform_account_id, state } — the state ties the
  // choice back to the just-exchanged token. Upserts the SocialAccount row.
  server.post('/me/social/accounts', async (request) => {
    const body = z
      .object({ platform_account_id: z.string().min(1), state: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('platform_account_id and state are required');

    const redis = getStateRedis();
    const raw = await redis.getdel(`social:tokens:${body.data.state}`);
    if (!raw) {
      throw validationError('OAuth session expired — please connect again');
    }
    const { accessToken, retailerId: boundRetailerId } = JSON.parse(raw) as {
      accessToken: string;
      retailerId: string;
    };
    if (boundRetailerId !== request.retailerId) {
      throw validationError('Invalid or expired OAuth state');
    }

    // Determine if the platform_account_id is a Facebook Page or Instagram Account
    let platform: 'FACEBOOK' | 'INSTAGRAM' = 'FACEBOOK'; // default
    let pageInfo: { id: string; name: string; access_token: string } | null = null;

    // First, try to fetch as a Facebook Page
    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${body.data.platform_account_id}?${new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name,access_token',
      })}`,
    );

    if (fbRes.ok) {
      const fbPage = (await fbRes.json()) as { id?: string; name?: string; access_token?: string };
      if (fbPage.id && fbPage.name && fbPage.access_token) {
        platform = 'FACEBOOK';
        pageInfo = { id: fbPage.id, name: fbPage.name, access_token: fbPage.access_token };
      }
    }

    // If not a Facebook Page, try as an Instagram Account
    if (!pageInfo) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${body.data.platform_account_id}?${new URLSearchParams({
          access_token: accessToken,
          fields: 'id,name',
        })}`,
      );

      if (igRes.ok) {
        const igAccount = (await igRes.json()) as { id?: string; name?: string };
        if (igAccount.id && igAccount.name) {
          platform = 'INSTAGRAM';
          // For Instagram, we use the same access token (it's valid for both FB and IG)
          pageInfo = { id: igAccount.id, name: igAccount.name, access_token: accessToken };
        }
      }
    }

    if (!pageInfo) {
      throw new MetaApiError(
        'Could not fetch the selected Facebook Page or Instagram Account',
        400,
        'ACCOUNT_FETCH_FAILED',
      );
    }

    const account = await prisma.socialAccount.upsert({
      where: {
        retailer_id_platform_platform_account_id: {
          retailer_id: request.retailerId,
          platform,
          platform_account_id: pageInfo.id,
        },
      },
      update: {
        platform_account_name: pageInfo.name,
        access_token_encrypted: encryptSecret(pageInfo.access_token),
        is_active: true,
      },
      create: {
        retailer_id: request.retailerId,
        platform,
        platform_account_id: pageInfo.id,
        platform_account_name: pageInfo.name,
        access_token_encrypted: encryptSecret(pageInfo.access_token),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'connect',
        resource_type: 'SocialAccount',
        resource_id: account.id,
        metadata: { platform, platform_account_id: pageInfo.id, account_name: pageInfo.name },
        ip_address: request.ip,
      },
    });

    return { data: { id: account.id, platform, account_name: pageInfo.name } };
  });
  // ─── GET /retailers/me/social/accounts — list connected accounts ─
  server.get('/me/social/accounts', async (request) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { retailer_id: request.retailerId, is_active: true },
      select: {
        id: true,
        platform: true,
        platform_account_id: true,
        platform_account_name: true,
        token_expires_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
    return {
      data: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        account_id: a.platform_account_id,
        account_name: a.platform_account_name,
        token_expires_at: a.token_expires_at,
        connected_at: a.created_at,
      })),
    };
  });
  // ─── DELETE /retailers/me/social/accounts/:id — disconnect ───────
  server.delete<{ Params: { id: string } }>('/me/social/accounts/:id', async (request, reply) => {
    const account = await prisma.socialAccount.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId },
    });
    if (!account) throw notFound('Social account');

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { is_active: false },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'disconnect',
        resource_type: 'SocialAccount',
        resource_id: account.id,
        metadata: { platform: account.platform, platform_account_id: account.platform_account_id },
        ip_address: request.ip,
      },
    });
    return reply.status(204).send();
  });
};
