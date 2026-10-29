// passport-activity.ts — recently-viewed + event beacon (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { CustomerInteractionType } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPassportSession, productRetailerMap } from './passport-helpers.js';

// Client sends lowercase event names (trackPassportEvent); the DB enum is
// uppercase. Anything not in this map is dropped, same posture as an
// invalid Zod payload — the beacon is fire-and-forget, never surfaced.
// Literal strings, not the CustomerInteractionType runtime object — this is
// a type-only import, so unrelated tests that mock '@kanchuki/db' without
// stubbing this enum aren't broken by importing this module.
const EVENT_TYPE_MAP: Record<string, CustomerInteractionType> = {
  view: 'VIEW',
  search: 'SEARCH',
  favorite: 'FAVORITE',
  unfavorite: 'UNFAVORITE',
  enquiry: 'ENQUIRY',
  store_visit: 'STORE_VISIT',
};

export const passportActivityRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/recently-viewed ─────────────────────────────
  // Returns recently viewed products across all stores for this passport.
  server.get('/recently-viewed', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const query = request.query as { limit?: string };
    const limit = Math.min(Number.parseInt(query.limit || '20', 10) || 20, 50);

    const items = await prisma.customerRecentlyViewed.findMany({
      where: { customer_account_id: session.customer_account_id },
      orderBy: { viewed_at: 'desc' },
      take: limit,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            primary_color: true,
            price_min: true,
            price_max: true,
            photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
            retailer: { select: { id: true, shop_name: true, public_slug: true } },
          },
        },
      },
    });

    return reply.status(200).send({
      items: items.map((item) => ({
        id: item.product_id,
        name: item.product.name,
        category: item.product.category,
        primary_color: item.product.primary_color,
        price_min: item.product.price_min,
        price_max: item.product.price_max,
        photo_url: item.product.photos[0]?.url ?? null,
        retailer: item.product.retailer,
        viewed_at: item.viewed_at.toISOString(),
      })),
    });
  });
  // ─── POST /passport/recently-viewed ────────────────────────────
  // Record a product view. Upserts by (customer_account_id, product_id).
  server.post('/recently-viewed', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply.status(204).send(); // silently drop
    }

    const body = z
      // retailer_id ignored (H4-5/RC-095): the owner comes from the product row.
      .object({ product_id: z.string(), retailer_id: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) return reply.status(204).send();

    const retailerId = (await productRetailerMap([body.data.product_id])).get(body.data.product_id);
    if (!retailerId) return reply.status(204).send();

    await prisma.customerRecentlyViewed.upsert({
      where: {
        customer_account_id_product_id: {
          customer_account_id: session.customer_account_id,
          product_id: body.data.product_id,
        },
      },
      create: {
        customer_account_id: session.customer_account_id,
        product_id: body.data.product_id,
        retailer_id: retailerId,
      },
      update: { viewed_at: new Date() },
    });

    return reply.status(204).send();
  });
  // ─── POST /passport/events ─────────────────────────────────────
  // Client event beacon — batched behavioral events from the frontend.
  // Fire-and-forget: returns 204 immediately, swallows DB errors.
  server.post(
    '/events',
    { config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request, reply) => {
      const session = await getPassportSession(request.headers.cookie || '');
      if (!session) {
        return reply.status(204).send(); // silently drop if unauthenticated
      }

      const EventsSchema = z.object({
        events: z
          .array(
            z.object({
              type: z.string(),
              product_id: z.string().optional(),
              collection_id: z.string().optional(),
              retailer_id: z.string(),
              metadata: z.record(z.unknown()).optional(),
            }),
          )
          .max(50),
      });

      const body = EventsSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(204).send(); // silently drop invalid payloads
      }

      // profiling_enabled false ⇒ behavioral writes suppressed (DPDP opt-out,
      // same gate passport-preferences.ts uses for the preference vector).
      if (!session.customer_account.profiling_enabled) {
        return reply.status(204).send();
      }

      // H4-5/RC-095: retailer_id is client-supplied. Product events must match the
      // product's owner; store-level events must name a real retailer.
      const { events } = body.data;
      const owners = await productRetailerMap([
        ...new Set(events.flatMap((e) => e.product_id ?? [])),
      ]);
      const storeIds = [...new Set(events.filter((e) => !e.product_id).map((e) => e.retailer_id))];
      const realStores = new Set(
        storeIds.length
          ? (
              await prisma.retailer.findMany({
                where: { id: { in: storeIds } },
                select: { id: true },
              })
            ).map((r) => r.id)
          : [],
      );

      const rows = events.flatMap((event) => {
        const type = EVENT_TYPE_MAP[event.type];
        if (!type) return []; // unknown event name — drop, don't 500 the beacon
        const valid = event.product_id
          ? owners.get(event.product_id) === event.retailer_id
          : realStores.has(event.retailer_id);
        if (!valid) return [];
        return [
          {
            customer_account_id: session.customer_account_id,
            retailer_id: event.retailer_id,
            type,
            product_id: event.product_id ?? null,
            metadata: (event.collection_id
              ? { ...event.metadata, collection_id: event.collection_id }
              : event.metadata) as never,
          },
        ];
      });

      if (rows.length > 0) {
        await prisma.customerInteraction.createMany({ data: rows }).catch(() => {
          // Fire-and-forget beacon — never surface a DB error to the client.
        });
      }

      return reply.status(204).send();
    },
  );
};
