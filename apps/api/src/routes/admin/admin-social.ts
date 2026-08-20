// Admin Social Publishing oversight (F-031).
//
// Admin can view all connected Facebook/Instagram accounts across retailers,
// post history, success/failure rates, and manage connections.
// No new schema — queries existing SocialAccount + SocialPost models.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminSocialRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/social/accounts ──────────────────────────────────
  // All connected social accounts across all retailers.
  server.get('/social/accounts', async (request) => {
    const q = z
      .object({
        retailer_id: z.string().optional(),
        platform: z.enum(['FACEBOOK', 'INSTAGRAM']).optional(),
        is_active: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
      if (q.data.platform) where.platform = q.data.platform;
      if (q.data.is_active !== undefined) where.is_active = q.data.is_active;
    }

    const accounts = await prisma.socialAccount.findMany({
      where,
      include: {
        retailer: { select: { id: true, shop_name: true, city: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: accounts.map((a) => ({
        id: a.id,
        retailer_id: a.retailer_id,
        retailer_name: a.retailer.shop_name,
        retailer_city: a.retailer.city,
        platform: a.platform,
        account_id: a.platform_account_id,
        account_name: a.platform_account_name,
        is_active: a.is_active,
        post_count: a._count.posts,
        token_expires_at: a.token_expires_at,
        connected_at: a.created_at,
      })),
    };
  });

  // ─── GET /admin/social/stats ─────────────────────────────────────
  server.get('/social/stats', async () => {
    const [totalAccounts, activeAccounts, byPlatform, totalPosts, postsByStatus] =
      await Promise.all([
        prisma.socialAccount.count(),
        prisma.socialAccount.count({ where: { is_active: true } }),
        prisma.socialAccount.groupBy({
          by: ['platform'],
          _count: { id: true },
          where: { is_active: true },
        }),
        prisma.socialPost.count(),
        prisma.socialPost.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);

    return {
      data: {
        total_accounts: totalAccounts,
        active_accounts: activeAccounts,
        inactive_accounts: totalAccounts - activeAccounts,
        by_platform: byPlatform.map((r) => ({
          platform: r.platform,
          count: r._count.id,
        })),
        total_posts: totalPosts,
        posts_by_status: postsByStatus.map((r) => ({
          status: r.status,
          count: r._count.id,
        })),
      },
    };
  });

  // ─── GET /admin/social/accounts/:id ──────────────────────────────
  server.get('/social/accounts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const account = await prisma.socialAccount.findUnique({
      where: { id },
      include: {
        retailer: { select: { id: true, shop_name: true, city: true } },
        posts: {
          orderBy: { created_at: 'desc' },
          take: 50,
          select: {
            id: true,
            post_type: true,
            caption: true,
            status: true,
            external_post_url: true,
            error_message: true,
            product_ids: true,
            collection_id: true,
            created_at: true,
          },
        },
      },
    });
    if (!account) throw notFound('Social account');

    return {
      data: {
        id: account.id,
        retailer_id: account.retailer_id,
        retailer_name: account.retailer.shop_name,
        retailer_city: account.retailer.city,
        platform: account.platform,
        account_id: account.platform_account_id,
        account_name: account.platform_account_name,
        is_active: account.is_active,
        token_expires_at: account.token_expires_at,
        connected_at: account.created_at,
        posts: account.posts,
      },
    };
  });

  // ─── GET /admin/social/posts ─────────────────────────────────────
  // All posts across all retailers (admin overview).
  server.get('/social/posts', async (request) => {
    const q = z
      .object({
        retailer_id: z.string().optional(),
        platform: z.enum(['FACEBOOK', 'INSTAGRAM']).optional(),
        status: z.enum(['POSTED', 'FAILED']).optional(),
        post_type: z.enum(['SINGLE_PRODUCT', 'COLLECTION_LINK']).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
      if (q.data.platform) where.platform = q.data.platform;
      if (q.data.status) where.status = q.data.status;
      if (q.data.post_type) where.post_type = q.data.post_type;
    }

    const page = q.success && q.data.page ? q.data.page : 1;
    const limit = q.success && q.data.limit ? q.data.limit : 50;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.socialPost.findMany({
        where,
        include: {
          retailer: { select: { id: true, shop_name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.socialPost.count({ where }),
    ]);

    return {
      data: {
        posts: posts.map((p) => ({
          id: p.id,
          retailer_id: p.retailer_id,
          retailer_name: p.retailer.shop_name,
          platform: p.platform,
          post_type: p.post_type,
          caption: p.caption,
          status: p.status,
          external_post_url: p.external_post_url,
          error_message: p.error_message,
          product_ids: p.product_ids,
          collection_id: p.collection_id,
          created_at: p.created_at,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    };
  });

  // ─── DELETE /admin/social/accounts/:id — force disconnect ────────
  // Admin can force-disconnect a retailer's social account.
  server.delete('/social/accounts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const account = await prisma.socialAccount.findUnique({ where: { id } });
    if (!account) throw notFound('Social account');

    await prisma.socialAccount.update({
      where: { id },
      data: { is_active: false },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'force_disconnect',
        resource_type: 'SocialAccount',
        resource_id: id,
        metadata: { platform: account.platform, platform_account_id: account.platform_account_id },
        ip_address: request.ip,
      },
    });

    return { success: true };
  });
};
