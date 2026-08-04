// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin.js';
import { getSetting, saveSetting } from './settings-store.js';

// F-019 Task 2: system-enforced "first N catalog items free" window.
// Same audit-log-as-key-value-store pattern as theme/rate-limits above.
// The ticket-quoting route (team.ts PATCH /tickets/:id) reads this and
// auto-quotes ₹0 when the promo is live and the request is within the free
// limit — so the offer stops being tribal knowledge that whoever quotes a
// ticket has to remember.
const CATALOG_UPLOAD_PROMO_SETTING_KEY = 'catalog_upload_promo';

const CATALOG_UPLOAD_PROMO_SCHEMA = z
  .object({
    // null/absent = keep current; send null explicitly to disable the offer
    free_item_limit: z.number().int().min(1).max(100000).nullable().optional(),
    // ISO datetime; null = runs until explicitly cleared
    expires_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => v.free_item_limit !== undefined || v.expires_at !== undefined, {
    message: 'Provide at least one field to update',
  });

/**
 * Current catalog-upload free-item promo. `active` is true only while a
 * free_item_limit is set AND the window hasn't expired — that's the exact
 * condition the ticket-quoting route (team.ts) checks before forcing ₹0.
 * Resilient: any settings-read failure returns an inactive promo, so a DB
 * hiccup degrades to manual quoting instead of accidentally giving away
 * free uploads.
 */
export interface CatalogUploadPromo {
  free_item_limit: number | null; // null = offer disabled entirely
  expires_at: string | null; // null = no expiry (runs until cleared)
  active: boolean; // live right now
}

export async function getCatalogUploadPromo(): Promise<CatalogUploadPromo> {
  const saved = (await getSetting(
    CATALOG_UPLOAD_PROMO_SETTING_KEY,
  )) as Partial<CatalogUploadPromo> | null;
  const freeItemLimit = saved?.free_item_limit ?? null;
  const expiresAt = saved?.expires_at ?? null;
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  return {
    free_item_limit: freeItemLimit,
    expires_at: expiresAt,
    active: freeItemLimit !== null && !expired,
  };
}

export const adminCatalogPromoRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/settings/catalog-upload-promo', async () => {
    return { data: await getCatalogUploadPromo() };
  });

  server.put('/settings/catalog-upload-promo', async (request) => {
    const body = CATALOG_UPLOAD_PROMO_SCHEMA.parse(request.body);
    const current = await getCatalogUploadPromo();
    const merged = {
      free_item_limit:
        body.free_item_limit !== undefined ? body.free_item_limit : current.free_item_limit,
      expires_at: body.expires_at !== undefined ? body.expires_at : current.expires_at,
    };
    await saveSetting(CATALOG_UPLOAD_PROMO_SETTING_KEY, merged);
    request.log.info({ promo: merged }, 'Catalog upload promo updated');
    return { data: await getCatalogUploadPromo() };
  });
};
