// Phase 3: Local Discovery Engine — geo-search endpoint.
// Customers use this to find nearby retailers. Folded from
// services/local-discovery-engine/ orphan into the unified apps/ architecture.
//
// No auth required — this is a public endpoint (customer-facing).
// Uses Haversine distance calculation with bounding-box pre-filter for performance.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the bounding box for a given lat/lng and radius in km.
 * Used to narrow down the Prisma query before exact Haversine filtering.
 */
function getBoundingBox(lat: number, lng: number, radiusKm: number) {
  const latRadius = radiusKm / EARTH_RADIUS_KM;
  const lngRadius = latRadius / Math.cos((lat * Math.PI) / 180);

  return {
    minLat: lat - (latRadius * 180) / Math.PI,
    maxLat: lat + (latRadius * 180) / Math.PI,
    minLng: lng - (lngRadius * 180) / Math.PI,
    maxLng: lng + (lngRadius * 180) / Math.PI,
  };
}

/**
 * Haversine distance between two points in kilometers.
 * Accurate to ~0.3% — plenty for "near me" retailer search.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export const publicNearMeRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /near-me ───────────────────────────────────────────────
  // Find retailers within a given radius of a lat/lng point.
  // Query params: latitude (required), longitude (required), radius (optional, default 10km)
  server.get('/near-me', async (request) => {
    const query = z
      .object({
        latitude: z.string().min(1),
        longitude: z.string().min(1),
        radius: z.string().optional(),
      })
      .safeParse(request.query);

    if (!query.success) throw validationError('latitude and longitude are required');

    const lat = parseFloat(query.data.latitude);
    const lng = parseFloat(query.data.longitude);
    const radiusKm = query.data.radius ? parseFloat(query.data.radius) : 10;

    if (isNaN(lat) || isNaN(lng) || isNaN(radiusKm)) {
      throw validationError('latitude, longitude, and radius must be valid numbers');
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw validationError('Invalid coordinates');
    }

    if (radiusKm <= 0 || radiusKm > 500) {
      throw validationError('Radius must be between 0 and 500 km');
    }

    // Step 1: Bounding box pre-filter (fast, uses index)
    const box = getBoundingBox(lat, lng, radiusKm);

    const retailers = await prisma.retailer.findMany({
      where: {
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        is_suspended: false,
        deleted_at: null,
        public_slug: { not: null }, // only retailers with a public storefront
      },
      select: {
        id: true,
        shop_name: true,
        latitude: true,
        longitude: true,
        city: true,
        state: true,
        address_line1: true,
        address_line2: true,
        pincode: true,
        phone: true,
        whatsapp_number: true,
        public_slug: true,
        _count: {
          select: { products: { where: { deleted_at: null, status: 'AVAILABLE' } } },
        },
      },
    });

    // Step 2: Exact Haversine filter + distance calculation
    const nearby = retailers
      .map((r) => ({
        id: r.id,
        shop_name: r.shop_name,
        latitude: r.latitude,
        longitude: r.longitude,
        city: r.city,
        state: r.state,
        address: [r.address_line1, r.address_line2, r.pincode].filter(Boolean).join(', '),
        phone: r.phone,
        whatsapp_number: r.whatsapp_number,
        public_slug: r.public_slug,
        product_count: r._count.products,
        distance_km: Math.round(haversineDistance(lat, lng, r.latitude!, r.longitude!) * 10) / 10,
      }))
      .filter((r) => r.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    return {
      data: nearby,
      meta: {
        center: { latitude: lat, longitude: lng },
        radius_km: radiusKm,
        count: nearby.length,
      },
    };
  });
};
