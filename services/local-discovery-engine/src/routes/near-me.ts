// src/routes/near-me.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '@kanchuki/db';

const earthRadiusKm = 6371;

/**
 * Calculate the bounding box for a given latitude, longitude, and radius in kilometers.
 * Returns an object with minLat, maxLat, minLng, maxLng.
 */
function getBoundingBox(latitude: number, longitude: number, radiusKm: number) {
  const latRadius = radiusKm / earthRadiusKm;
  const lngRadius = latRadius / Math.cos((latitude * Math.PI) / 180);

  const minLat = latitude - (latRadius * 180) / Math.PI;
  const maxLat = latitude + (latRadius * 180) / Math.PI;
  const minLng = longitude - (lngRadius * 180) / Math.PI;
  const maxLng = longitude + (lngRadius * 180) / Math.PI;

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate the Haversine distance between two points in kilometers.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export default async function (fastify: FastifyInstance) {
  // Near me search
  fastify.get('/', async (request, reply) => {
    const { latitude, longitude, radius } = request.query as {
      latitude?: string;
      longitude?: string;
      radius?: string; // in kilometers, default to 10
    };

    if (!latitude || !longitude) {
      return reply.status(400).send({ error: 'latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = radius ? parseFloat(radius) : 10; // default 10 km

    if (isNaN(lat) || isNaN(lng) || isNaN(radiusKm)) {
      return reply.status(400).send({ error: 'latitude, longitude, and radius must be valid numbers' });
    }

    try {
      // Get bounding box to narrow down the search
      const box = getBoundingBox(lat, lng, radiusKm);

      // Find retailers within the bounding box
      const retailers = await prisma.retailer.findMany({
        where: {
          latitude: {
            gte: box.minLat,
            lte: box.maxLat
          },
          longitude: {
            gte: box.minLng,
            lte: box.maxLng
          },
          // We might want to only include active retailers (not suspended, not deleted)
          is_suspended: false,
          deleted_at: null
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
          whatsapp_number: true
        }
      });

      // Filter by actual distance (to account for the bounding box approximation)
      const nearbyRetailers = retailers
        .map(retailer => {
          const distance = haversineDistance(lat, lng, retailer.latitude!, retailer.longitude!);
          return { ...retailer, distance };
        })
        .filter(retailer => retailer.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance); // Sort by distance ascending

      return reply.send({ nearbyRetailers, count: nearbyRetailers.length });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Optional: Update retailer location (if we want to allow this service to update location)
  // We'll leave this to the retailer service, but we can provide an endpoint for convenience.
  fastify.put('/retailers/:id/location', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { latitude, longitude } = request.body as {
      latitude?: string;
      longitude?: string;
    };

    if (!latitude || !longitude) {
      return reply.status(400).send({ error: 'latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return reply.status(400).send({ error: 'latitude and longitude must be valid numbers' });
    }

    try {
      const retailer = await prisma.retailer.update({
        where: { id },
        data: {
          latitude: lat,
          longitude: lng
        }
      });

      return reply.send(retailer);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}