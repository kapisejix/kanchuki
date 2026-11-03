// Dashboard "Complete your profile" checklist
// (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part C).
//
// Item STATUS is always derived from real data on every request — nothing here stores
// "done". Only the owner's dismissals (retailers.setup_dismissed) and the team requests
// (support_tickets.setup_item) are stored. Owner-only: no staff/support allowlist lists
// these routes (deny-by-default) and every handler also checks isRealOwner (RC-068).
// The response carries keys + enums only — no ids, tokens, phones or URLs.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { gbpAvailable, gbpLinked } from '../../lib/gbp-availability.js';
import { isRealOwner } from '../../plugins/auth.js';
import { forbidden, notFound } from '../../plugins/error-handler.js';
import { createRoutedTicket } from './retailers-tickets.js';

// Ticket type per item. Reality (decision D4): the team can only call and guide the
// retailer for facebook/instagram/whatsapp_api (their own Meta login is required); only
// gst + google_place can be completed by the team inside a consented support session.
const ITEMS = {
  google_place: { ticket: 'GROWTH_SETUP', label: 'Google listing' },
  google_business: { ticket: 'GROWTH_SETUP', label: 'Google Business Profile reviews' },
  facebook: { ticket: 'GROWTH_SETUP', label: 'Facebook page' },
  instagram: { ticket: 'GROWTH_SETUP', label: 'Instagram account' },
  gst: { ticket: 'MAINTENANCE', label: 'GST details' },
  whatsapp_api: { ticket: 'MAINTENANCE', label: 'WhatsApp Business API' },
  // Offered only to app builds that send STORE_LOCATION_HEADER (see deriveChecklist).
  store_location: { ticket: 'MAINTENANCE', label: 'Store location' },
} as const;

/**
 * Builds older than this item crash on a checklist key they have no copy for, and the API cannot
 * tell build versions apart. So the item is opt-in: only a build that sends this header is told
 * about `store_location`. Delete the header check once every supported build ignores unknown keys.
 */
export const STORE_LOCATION_HEADER = 'x-checklist-store-location';

export type SetupItemKey = keyof typeof ITEMS;
const KEYS = Object.keys(ITEMS) as [SetupItemKey, ...SetupItemKey[]];
const ItemKey = z.enum(KEYS);

export type ChecklistStatus = 'done' | 'missing' | 'requested';
export type ChecklistItem = {
  key: SetupItemKey;
  status: ChecklistStatus;
  dismissed: boolean;
  can_ask: boolean;
};

/** All reads keyed on retailerId. Items the retailer's plan/platform can't offer are omitted. */
export async function deriveChecklist(
  retailerId: string,
  withStoreLocation = false,
): Promise<ChecklistItem[]> {
  const [retailer, social, openAsks, waPlan, gbpOn, gbpDone] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: retailerId },
      select: {
        latitude: true,
        longitude: true,
        location_source: true,
        google_place_id: true,
        gstin: true,
        whatsapp_api_phone_number_id: true,
        whatsapp_api_access_token: true,
        setup_dismissed: true,
      },
    }),
    prisma.socialAccount.findMany({
      where: { retailer_id: retailerId, is_active: true },
      select: { platform: true },
    }),
    prisma.supportTicket.findMany({
      where: {
        retailer_id: retailerId,
        setup_item: { not: null },
        status: { in: ['OPEN', 'ASSIGNED'] },
      },
      select: { setup_item: true },
    }),
    hasFeature(retailerId, 'WHATSAPP_BUSINESS_API'),
    gbpAvailable(retailerId),
    gbpLinked(retailerId),
  ]);
  if (!retailer) throw notFound('Retailer');

  const platforms = new Set(social.map((s) => s.platform));
  const asked = new Set(openAsks.map((t) => t.setup_item));
  const dismissed = new Set(retailer.setup_dismissed);

  const done: Record<SetupItemKey, boolean> = {
    google_place: !!retailer.google_place_id,
    google_business: gbpDone,
    facebook: platforms.has('FACEBOOK'),
    instagram: platforms.has('INSTAGRAM'),
    gst: !!retailer.gstin?.trim(),
    whatsapp_api: !!retailer.whatsapp_api_phone_number_id && !!retailer.whatsapp_api_access_token,
    // A backfilled guess (GEOCODED_APPROX) still needs the owner's own pin.
    store_location:
      retailer.latitude != null &&
      retailer.longitude != null &&
      retailer.location_source !== 'GEOCODED_APPROX',
  };
  const offered: Record<SetupItemKey, boolean> = {
    google_place: true,
    google_business: gbpOn,
    facebook: true,
    instagram: true,
    gst: true,
    whatsapp_api: waPlan,
    store_location: withStoreLocation,
  };

  return KEYS.filter((key) => offered[key]).map((key) => {
    const status: ChecklistStatus = done[key] ? 'done' : asked.has(key) ? 'requested' : 'missing';
    return { key, status, dismissed: dismissed.has(key), can_ask: status === 'missing' };
  });
}

const wantsStoreLocation = (request: FastifyRequest) =>
  request.headers[STORE_LOCATION_HEADER] === '1';

function requireOwner(request: FastifyRequest): void {
  if (!isRealOwner(request)) throw forbidden('Only the shop owner can do this');
}

export const retailersSetupChecklistRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /me/setup-checklist ────────────────────────────────────
  server.get('/me/setup-checklist', async (request) => {
    requireOwner(request);
    const items = await deriveChecklist(request.retailerId, wantsStoreLocation(request));
    const visible_missing = items.filter((i) => i.status !== 'done' && !i.dismissed).length;
    return { data: { items, visible_missing } };
  });

  // ─── POST /me/setup-checklist/dismiss | restore ─────────────────
  // Hiding only. restore with no item_key brings every hidden item back.
  server.post('/me/setup-checklist/dismiss', async (request) => {
    requireOwner(request);
    const key = z.object({ item_key: ItemKey }).parse(request.body).item_key;
    const row = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { setup_dismissed: true },
    });
    if (!row) throw notFound('Retailer');
    const next = [...new Set([...row.setup_dismissed, key])];
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { setup_dismissed: next },
    });
    return { data: { dismissed: next } };
  });

  server.post('/me/setup-checklist/restore', async (request) => {
    requireOwner(request);
    const body = z.object({ item_key: ItemKey.optional() }).parse(request.body ?? {});
    const row = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { setup_dismissed: true },
    });
    if (!row) throw notFound('Retailer');
    const next = body.item_key ? row.setup_dismissed.filter((k) => k !== body.item_key) : [];
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { setup_dismissed: next },
    });
    return { data: { dismissed: next } };
  });

  // ─── POST /me/setup-checklist/:item_key/ask ─────────────────────
  // "Ask Kanchuki team": one routed ticket per item. A ticket grants the team NO access to
  // the account; consent stays in the support-session flow. One OPEN/ASSIGNED ask per
  // (retailer, item) is enforced by a partial unique index (migration 143); the lookup
  // below only makes a repeat tap return the existing request instead of an error.
  server.post<{ Params: { item_key: string } }>(
    '/me/setup-checklist/:item_key/ask',
    async (request, reply) => {
      requireOwner(request);
      const parsed = ItemKey.safeParse(request.params.item_key);
      if (!parsed.success) throw notFound('Checklist item');
      const key = parsed.data;

      const items = await deriveChecklist(request.retailerId, wantsStoreLocation(request));
      const item = items.find((i) => i.key === key);
      if (!item) throw notFound('Checklist item');
      if (item.status === 'done') {
        reply.code(409);
        return { data: { status: 'done' as const } };
      }
      if (item.status === 'requested') return { data: { status: 'requested' as const } };

      try {
        await createRoutedTicket(
          request.retailerId,
          {
            ticket_type: ITEMS[key].ticket,
            requires_visit: false,
            setup_item: key,
            note: `[setup:${key}] Owner asked the Kanchuki team for help with: ${ITEMS[key].label}.`,
          },
          request.log,
        );
      } catch (err) {
        // Lost a race with a second tap: the unique index refused the twin.
        if ((err as { code?: string }).code !== 'P2002') throw err;
        return { data: { status: 'requested' as const } };
      }
      reply.code(201);
      return { data: { status: 'requested' as const } };
    },
  );
};
