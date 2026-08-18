// Phase II: WhatsApp Native Catalog Sync — Meta webhook receiver (E1–E7).
//
// Meta posts catalog events here (subscribe to the WhatsApp Business Account
// object in the Meta for Developers app → Webhooks). The Kanchuki side keeps
// its local CatalogItem mapping + Product status in sync with what actually
// exists on Meta (the source of truth for availability changes made by
// buyers/retailers directly in WhatsApp).
//
// Meta webhook contract (important — the breakdown doc's E2 wording was off):
//   - GET  handshake: Meta calls ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//     The verify token is the string YOU configure in the dashboard — we set it
//     to META_WEBHOOK_SECRET. Echo hub.challenge back verbatim on success.
//   - POST events: signed with `X-Hub-Signature-256: sha256=<HMAC-SHA256(
//     raw body, META_APP_SECRET)>`. Meta signs with the APP SECRET, not the
//     webhook/verify token. We verify against getSecret('META_APP_SECRET') and
//     fail closed.
//
// Dashboard setup (Meta for Developers → App → WhatsApp → Configuration → Webhook):
//   Callback URL: https://api.kanchuki.app/v1/public/webhooks/whatsapp-catalog
//   Verify token:  <META_WEBHOOK_SECRET>
//   Subscribe to:  catalog updates on the WhatsApp Business Account
//
// Event fields handled (tolerant — exact names vary by object/version):
//   catalog_item_added / product_item_added      → confirm/refresh local mapping (E3)
//   catalog_item_updated / product_item_updated  → sync price/availability back (E4)
//   catalog_item_deleted / product_item_deleted  → drop local mapping (E5)
//   catalog_item_out_of_stock / item_availability_updated → Product.status (E6)
// Every handled event records a CatalogSyncLog row (E7). Unmatched events are
// logged with matched:false — never a failure (Meta may deliver events for
// items from other tools sharing the catalog).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { addCatalogSyncJob } from '../../jobs/index.js';

const CATALOG_EVENT_FIELDS = new Set([
  'catalog_item_added',
  'catalog_item_updated',
  'catalog_item_deleted',
  'catalog_item_out_of_stock',
  'product_item_added',
  'product_item_updated',
  'product_item_deleted',
  'product_item_out_of_stock',
  'item_availability_updated',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Meta availability → Kanchuki ProductStatus (mirror of mapProductStatus). */
function availabilityToStatus(availability: string | undefined): string | null {
  switch (availability) {
    case 'in stock':
      return 'AVAILABLE';
    case 'available for order':
    case 'preorder':
      return 'RESERVED';
    case 'out of stock':
      return 'SOLD';
    default:
      return null;
  }
}

/** Verify the X-Hub-Signature-256 header against the raw body + app secret. */
async function verifyHubSignature(rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const appSecret = (await getSecret('META_APP_SECRET'))?.trim();
  if (!appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.slice('sha256='.length));
  return a.length === b.length && timingSafeEqual(a, b);
}

interface LocalItem {
  product_id: string;
  whatsapp_catalog_item_id: string;
  whatsapp_catalog_id: string;
}

async function findLocalItem(metaItemId?: string, productId?: string): Promise<LocalItem | null> {
  if (metaItemId) {
    const byMeta = await prisma.catalogItem.findFirst({
      where: { whatsapp_catalog_item_id: metaItemId },
      select: {
        product_id: true,
        whatsapp_catalog_item_id: true,
        whatsapp_catalog_id: true,
      },
    });
    if (byMeta) return byMeta;
  }
  if (productId) {
    const byProduct = await prisma.catalogItem.findUnique({
      where: { product_id: productId },
      select: {
        product_id: true,
        whatsapp_catalog_item_id: true,
        whatsapp_catalog_id: true,
      },
    });
    if (byProduct) return byProduct;
  }
  return null;
}

async function recordEvent(
  retailerId: string,
  log: {
    field: string;
    product_id?: string | null;
    meta_item_id?: string | null;
    meta_catalog_id?: string | null;
    matched: boolean;
    action?: string;
    error?: string;
  },
): Promise<void> {
  try {
    await prisma.catalogSyncLog.create({
      data: {
        retailer_id: retailerId,
        operation: 'webhook',
        product_id: log.product_id ?? null,
        meta_item_id: log.meta_item_id ?? null,
        meta_catalog_id: log.meta_catalog_id ?? null,
        status: 'SUCCESS',
        error_message: log.error ?? null,
        payload_json: { field: log.field, matched: log.matched, action: log.action ?? null },
      },
    });
  } catch (err) {
    // The audit trail must never fail the webhook (Meta would retry a
    // received event, producing duplicate processing).
    console.error(`Failed to record catalog webhook event for retailer ${retailerId}:`, err);
  }
}

export const whatsappCatalogWebhookRoutes: FastifyPluginAsync = async (server) => {
  // Meta signs the raw body — capture it (same pattern as checkout-webhook).
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: FastifyRequest, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── GET /public/webhooks/whatsapp-catalog — subscription handshake ─
  // Meta verifies the callback URL with this GET before enabling the webhook.
  server.get('/public/webhooks/whatsapp-catalog', async (request, reply) => {
    // Meta sends dotted keys (hub.mode / hub.verify_token / hub.challenge);
    // Fastify's query parser does NOT flatten them into hub_mode etc.
    const query = request.query as Record<string, unknown>;
    const mode = firstString(query['hub.mode'], query.hub_mode);
    const token = firstString(query['hub.verify_token'], query.hub_verify_token);
    const challenge = firstString(query['hub.challenge'], query.hub_challenge);

    if (mode !== 'subscribe') {
      return reply.status(400).send({ error: { code: 'INVALID_MODE', status: 400 } });
    }

    const expectedToken = (await getSecret('META_WEBHOOK_SECRET'))?.trim();
    if (!expectedToken || token !== expectedToken) {
      return reply.status(401).send({ error: { code: 'INVALID_VERIFY_TOKEN', status: 401 } });
    }
    if (!challenge) {
      return reply.status(400).send({ error: { code: 'MISSING_CHALLENGE', status: 400 } });
    }
    // Meta expects the challenge echoed back as the raw response body.
    return reply.type('text/plain').send(challenge);
  });

  // ── POST /public/webhooks/whatsapp-catalog — event receiver ──────
  // No JWT (the /v1/public prefix is auth-exempt); authentication is the
  // X-Hub-Signature-256 header verified against META_APP_SECRET.
  server.post('/public/webhooks/whatsapp-catalog', async (request, reply) => {
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
    const signature = request.headers['x-hub-signature-256'] as string | undefined;

    const appSecret = (await getSecret('META_APP_SECRET'))?.trim();
    if (!appSecret) {
      request.log.warn('META_APP_SECRET not set — catalog webhooks are being rejected.');
      return reply.status(503).send({ error: { code: 'SERVICE_UNAVAILABLE', status: 503 } });
    }
    if (!(await verifyHubSignature(rawBody, signature))) {
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', status: 401 } });
    }

    const body = asRecord(request.body);
    if (!body) {
      return reply.status(422).send({ error: { code: 'INVALID_PAYLOAD', status: 422 } });
    }

    const entries = Array.isArray(body.entry) ? body.entry : [];
    let handled = 0;
    let unmatched = 0;

    for (const entry of entries) {
      const entryRecord = asRecord(entry);
      const changes = Array.isArray(entryRecord?.changes) ? entryRecord.changes : [];
      for (const change of changes) {
        const changeRecord = asRecord(change);
        const field = firstString(changeRecord?.field);
        if (!field || !CATALOG_EVENT_FIELDS.has(field)) continue; // ignore non-catalog events

        const value = asRecord(changeRecord?.value);
        // Event payloads differ by object — tolerant extraction.
        const metaItemId = firstString(value?.id, value?.item_id, value?.catalog_item_id);
        const productId = firstString(value?.retailer_id, value?.product_id, value?.external_id);
        const price = typeof value?.price === 'number' ? value.price : undefined;
        const availability = firstString(value?.availability, value?.status);

        try {
          const item = await findLocalItem(metaItemId, productId);

          // Resolve the owning retailer for logging + sync enqueues. The
          // external id we pass to Meta IS the Kanchuki product id, so an
          // unmatched event can still be attributed to a retailer.
          const productRow = item
            ? await prisma.product.findUnique({
                where: { id: item.product_id },
                select: { retailer_id: true, deleted_at: true },
              })
            : productId
              ? await prisma.product.findUnique({
                  where: { id: productId },
                  select: { retailer_id: true, deleted_at: true },
                })
              : null;
          const retailerId = productRow?.retailer_id ?? null;

          if (!item) {
            unmatched += 1;
            // Unmatched ADDED event → the item exists on Meta but has no local
            // mapping (mapping deleted, or created Meta-side). When the product
            // is known + live, enqueue an incremental sync to recreate the
            // mapping with the Meta item id — matched on the next event.
            if (field.endsWith('_added') && productId && productRow && !productRow.deleted_at) {
              await addCatalogSyncJob({
                retailer_id: retailerId!,
                operation: 'single_product',
                product_id: productId,
                triggered_by: 'webhook',
              }).catch((err: unknown) => {
                request.log.warn({ err, field, productId }, 'Failed to enqueue webhook-triggered sync');
              });
            }
            await recordEvent(retailerId ?? 'unknown', {
              field,
              product_id: productId ?? null,
              meta_item_id: metaItemId ?? null,
              matched: false,
              action: field.endsWith('_added') && productId && productRow ? 'sync_enqueued' : undefined,
            });
            continue;
          }

          if (!retailerId) {
            unmatched += 1;
            await recordEvent('unknown', {
              field,
              product_id: item.product_id,
              meta_item_id: metaItemId ?? null,
              meta_catalog_id: item.whatsapp_catalog_id,
              matched: false,
              error: 'product not found for mapped item',
            });
            continue;
          }

          handled += 1;

          // E5: deleted → drop the local mapping (a future sync recreates it).
          if (field.endsWith('_deleted')) {
            await prisma.catalogItem.delete({ where: { product_id: item.product_id } });
            await prisma.product.update({
              where: { id: item.product_id },
              data: { whatsapp_catalog_item_id: null },
            });
            await recordEvent(retailerId, {
              field,
              product_id: item.product_id,
              meta_item_id: item.whatsapp_catalog_item_id,
              meta_catalog_id: item.whatsapp_catalog_id,
              matched: true,
              action: 'meta_deleted',
            });
            continue;
          }

          // E6: out-of-stock availability → reflect on the product.
          const newStatus =
            field === 'catalog_item_out_of_stock' || field === 'product_item_out_of_stock'
              ? 'SOLD'
              : availabilityToStatus(availability);

          if (newStatus) {
            await prisma.product.update({
              where: { id: item.product_id },
              data: { status: newStatus as 'AVAILABLE' | 'SOLD' | 'RESERVED' },
            });
          }

          // E4: sync price/availability back into the local snapshot.
          const snapshotUpdate: Record<string, unknown> = { status: 'SUCCESS', error_message: null };
          if (typeof price === 'number') {
            snapshotUpdate.product_price_paise = price;
            await prisma.product.update({
              where: { id: item.product_id },
              data: { price_min: price },
            });
          }
          if (newStatus) snapshotUpdate.product_status_snapshot = newStatus;
          await prisma.catalogItem.update({
            where: { product_id: item.product_id },
            data: { ...snapshotUpdate, last_synced_at: new Date() },
          });

          await recordEvent(retailerId, {
            field,
            product_id: item.product_id,
            meta_item_id: item.whatsapp_catalog_item_id,
            meta_catalog_id: item.whatsapp_catalog_id,
            matched: true,
            action: newStatus ? 'status_updated' : 'confirmed',
          });
        } catch (err) {
          // Per-event failure must not 500 the batch — Meta retries on 5xx.
          request.log.error({ err, field }, 'Failed to process catalog webhook event');
          unmatched += 1;
        }
      }
    }

    return reply.send({ received: true, handled, unmatched });
  });
};
