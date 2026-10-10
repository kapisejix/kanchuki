// Phase 3: Local Discovery Engine — geo-search endpoint.
// Customers use this to find nearby retailers. Folded from
// services/local-discovery-engine/ orphan into the unified apps/ architecture.
//
// No auth required — this is a public endpoint (customer-facing).
// Uses Haversine distance calculation with bounding-box pre-filter for performance.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getBoundingBox, haversineDistance } from '../../lib/geo.js';
import { validationError } from '../../plugins/error-handler.js';

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

    const lat = Number.parseFloat(query.data.latitude);
    const lng = Number.parseFloat(query.data.longitude);
    const radiusKm = query.data.radius ? Number.parseFloat(query.data.radius) : 10;

    if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusKm)) {
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
      .map((r) => {
        // The bounding-box filter above excludes null coordinates, but the
        // column is nullable — fall back to the query point (distance 0) rather
        // than asserting.
        const shopLat = r.latitude ?? lat;
        const shopLng = r.longitude ?? lng;
        return {
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
          distance_km: Math.round(haversineDistance(lat, lng, shopLat, shopLng) * 10) / 10,
        };
      })
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
