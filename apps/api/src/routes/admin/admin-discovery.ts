// Admin Local Discovery — "which stores are within R km of this pincode / city?"
//
// Reads retailers that have coordinates (retailers.latitude / longitude: a retailer's own pin or
// a GEOCODED_APPROX backfill, see location_source). The search centre comes from the same
// Nominatim geocoder as the backfill. Segment 'discovery' in admin-access.ts (standard admin).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { type GeocodeHit, geocodeAddress } from '../../lib/geocode-address.js';
import { getBoundingBox, haversineDistance } from '../../lib/geo.js';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

// A pincode/city does not move, so a hit is cached for a day. Also keeps this admin tool far
// below Nominatim's 1 request/second policy.
// ponytail: per-process memory cache, no Redis; the ceiling is one lookup per new place per boot.
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const geocodeCache = new Map<string, { hit: GeocodeHit; at: number }>();

async function resolveCenter(query: string): Promise<GeocodeHit | null> {
  const key = query.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < GEOCODE_TTL_MS) return cached.hit;
  const hit = await geocodeAddress(
    /^\d{6}$/.test(query) ? { pincode: query } : { city: query },
    fetch,
    async () => {}, // single admin lookup; the route rate limit keeps us under 1 req/s
  );
  if (hit) {
    if (geocodeCache.size >= 500) geocodeCache.clear();
    geocodeCache.set(key, { hit, at: Date.now() });
  }
  return hit;
}

export const adminDiscoveryRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /discovery/nearby?query=<pincode|city>&radius_km=25 ─────
  server.get(
    '/discovery/nearby',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const q = z
        .object({
          query: z.string().trim().min(2).max(100),
          radius_km: z.coerce.number().int().min(1).max(200).default(25),
        })
        .parse(request.query ?? {});

      const center = await resolveCenter(q.query);
      if (!center) throw notFound('Place');

      // Index-friendly box first, exact distance second. Rows without coordinates never match.
      const box = getBoundingBox(center.lat, center.lng, q.radius_km);
      const rows = await prisma.retailer.findMany({
        where: {
          deleted_at: null,
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLng, lte: box.maxLng },
        },
        select: {
          id: true,
          shop_name: true,
          phone: true,
          city: true,
          state: true,
          pincode: true,
          address_line1: true,
          latitude: true,
          longitude: true,
          location_source: true,
          public_slug: true,
          _count: { select: { products: { where: { deleted_at: null } } } },
        },
        take: 500,
      });

      const retailers = rows
        .flatMap(({ _count, latitude, longitude, ...r }) => {
          if (latitude === null || longitude === null) return [];
          const km = haversineDistance(center.lat, center.lng, latitude, longitude);
          if (km > q.radius_km) return [];
          return [
            {
              ...r,
              latitude,
              longitude,
              product_count: _count.products,
              distance_km: Math.round(km * 10) / 10,
            },
          ];
        })
        .sort((a, b) => a.distance_km - b.distance_km);

      return {
        data: {
          center: { lat: center.lat, lng: center.lng, label: center.display, level: center.level },
          radius_km: q.radius_km,
          count: retailers.length,
          retailers,
        },
      };
    },
  );
};
