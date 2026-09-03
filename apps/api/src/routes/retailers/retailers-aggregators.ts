// Phase 7 — Aggregator / Marketplace Sync
//
// Retailer flows:
//   1. List connected channels (GET /me/aggregators)
//   2. Connect a channel (POST /me/aggregators)
//   3. Disconnect a channel (DELETE /me/aggregators/:id)
//   4. Trigger manual sync (POST /me/aggregators/:id/sync)
//   5. Update channel config (PUT /me/aggregators/:id)
//
// Security:
//   - ChannelSyncs are retailer-scoped (can only access own)
//   - Feature gated behind CHANNEL_SYNC feature flag
//   - API credentials are stored encrypted at rest (AES-256-GCM)
//   - Every action records an audit log

import { encryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

const CHANNEL_LABELS: Record<string, string> = {
  MEESHO: 'Meesho',
  INSTAMOJO: 'Instamojo',
  GLOAD: 'Glroad',
  CRAFTSVILLA: 'Craftsvilla',
  FLIPKART: 'Flipkart',
  AMAZON: 'Amazon',
  OTHER: 'Other',
};

const ConnectSchema = z.object({
  channel: z.enum(['MEESHO', 'INSTAMOJO', 'GLOAD', 'CRAFTSVILLA', 'FLIPKART', 'AMAZON', 'OTHER']),
  api_key: z.string().min(1).max(500),
  api_secret: z.string().max(500).optional(),
  auth_token: z.string().max(500).optional(),
  webhook_secret: z.string().max(500).optional(),
  channel_shop_id: z.string().max(200).optional(),
  channel_shop_url: z.string().url().max(500).optional(),
});

const UpdateSchema = z.object({
  api_key: z.string().min(1).max(500).optional(),
  api_secret: z.string().max(500).optional(),
  auth_token: z.string().max(500).optional(),
  webhook_secret: z.string().max(500).optional(),
  channel_shop_id: z.string().max(200).optional(),
  channel_shop_url: z.string().url().max(500).optional(),
  is_active: z.boolean().optional(),
});

export const retailersAggregatorRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'CHANNEL_SYNC'))) {
      throw featureUnavailable('Marketplace Sync');
    }
  };

  // ─── GET /retailers/me/aggregators — list connected channels ──────
  server.get('/me/aggregators', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const syncs = await prisma.channelSync.findMany({
      where: { retailer_id: retailerId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        channel: true,
        status: true,
        last_synced_at: true,
        last_sync_error: true,
        products_synced: true,
        orders_synced: true,
        channel_shop_id: true,
        channel_shop_url: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        api_key_encrypted: true,
      },
    });

    return {
      data: syncs.map(({ api_key_encrypted, ...s }) => ({
        ...s,
        channel_label: CHANNEL_LABELS[s.channel] ?? s.channel,
        credentials_configured: !!api_key_encrypted,
      })),
    };
  });

  // ─── POST /retailers/me/aggregators — connect a channel ───────────
  server.post('/me/aggregators', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const body = ConnectSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // Check for existing connection to same channel
    const existing = await prisma.channelSync.findFirst({
      where: { retailer_id: retailerId, channel: body.data.channel },
    });
    if (existing) {
      throw validationError(
        `Already connected to ${CHANNEL_LABELS[body.data.channel] ?? body.data.channel}. Disconnect first.`,
      );
    }

    // Credentials are stored encrypted at rest — never persist plaintext.
    const sync = await prisma.channelSync.create({
      data: {
        retailer_id: retailerId,
        channel: body.data.channel,
        status: 'CONNECTED',
        api_key_encrypted: encryptSecret(body.data.api_key),
        api_secret_encrypted: body.data.api_secret
          ? encryptSecret(body.data.api_secret)
          : undefined,
        auth_token_encrypted: body.data.auth_token
          ? encryptSecret(body.data.auth_token)
          : undefined,
        webhook_secret: body.data.webhook_secret
          ? encryptSecret(body.data.webhook_secret)
          : undefined,
        channel_shop_id: body.data.channel_shop_id,
        channel_shop_url: body.data.channel_shop_url,
      },
      select: {
        id: true,
        channel: true,
        status: true,
        channel_shop_id: true,
        channel_shop_url: true,
        is_active: true,
        created_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'connect_channel',
        resource_type: 'ChannelSync',
        resource_id: sync.id,
        metadata: { channel: sync.channel },
        ip_address: request.ip,
      },
    });

    return { data: sync };
  });

  // ─── GET /retailers/me/aggregators/:id — get single channel detail ──
  server.get('/me/aggregators/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const sync = await prisma.channelSync.findFirst({
      where: { id, retailer_id: retailerId },
      select: {
        id: true,
        channel: true,
        status: true,
        last_synced_at: true,
        last_sync_error: true,
        products_synced: true,
        orders_synced: true,
        channel_shop_id: true,
        channel_shop_url: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!sync) throw notFound('Channel sync');

    return {
      data: {
        ...sync,
        channel_label: CHANNEL_LABELS[sync.channel] ?? sync.channel,
      },
    };
  });

  // ─── PUT /retailers/me/aggregators/:id — update channel config ─────
  server.put('/me/aggregators/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.channelSync.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Channel sync');

    const body = UpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updateData: Record<string, unknown> = {};
    if (body.data.api_key !== undefined)
      updateData.api_key_encrypted = encryptSecret(body.data.api_key);
    if (body.data.api_secret !== undefined)
      updateData.api_secret_encrypted = encryptSecret(body.data.api_secret);
    if (body.data.auth_token !== undefined)
      updateData.auth_token_encrypted = encryptSecret(body.data.auth_token);
    if (body.data.webhook_secret !== undefined)
      updateData.webhook_secret = encryptSecret(body.data.webhook_secret);
    if (body.data.channel_shop_id !== undefined)
      updateData.channel_shop_id = body.data.channel_shop_id;
    if (body.data.channel_shop_url !== undefined)
      updateData.channel_shop_url = body.data.channel_shop_url;
    if (body.data.is_active !== undefined) updateData.is_active = body.data.is_active;

    const updated = await prisma.channelSync.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        channel: true,
        status: true,
        channel_shop_id: true,
        channel_shop_url: true,
        is_active: true,
        updated_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'update_channel',
        resource_type: 'ChannelSync',
        resource_id: id,
        metadata: { changes: Object.keys(updateData) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── DELETE /retailers/me/aggregators/:id — disconnect channel ─────
  server.delete('/me/aggregators/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.channelSync.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Channel sync');

    await prisma.channelSync.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'disconnect_channel',
        resource_type: 'ChannelSync',
        resource_id: id,
        metadata: { channel: existing.channel },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });

  // ─── POST /retailers/me/aggregators/:id/sync — trigger manual sync ──
  // Placeholder: in production this would queue a BullMQ job to push products
  // to the external marketplace. For now, mark status as CONNECTED and record
  // the attempt.
  server.post('/me/aggregators/:id/sync', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.channelSync.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Channel sync');
    if (existing.status === 'SYNCING') {
      throw validationError('Sync already in progress');
    }

    // Mark as syncing
    await prisma.channelSync.update({
      where: { id },
      data: { status: 'SYNCING', last_sync_error: null },
    });

    // In production, enqueue BullMQ job here.
    // For now, simulate success after marking.
    await prisma.channelSync.update({
      where: { id },
      data: {
        status: 'CONNECTED',
        last_synced_at: new Date(),
        last_sync_error: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'trigger_channel_sync',
        resource_type: 'ChannelSync',
        resource_id: id,
        metadata: { channel: existing.channel },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        message: 'Sync triggered',
        channel: existing.channel,
        status: 'CONNECTED',
      },
    };
  });
};
