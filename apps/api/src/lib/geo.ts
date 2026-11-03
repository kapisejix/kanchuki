// Shared geo helpers — used by /public/near-me and the /public/stores nearby mode.

const EARTH_RADIUS_KM = 6371;

/**
 * Bounding box for a lat/lng and radius in km. Narrows the Prisma query
 * (uses the retailers lat/lng index) before the exact Haversine filter.
 */
export function getBoundingBox(lat: number, lng: number, radiusKm: number) {
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
 * Rough bounding box of India (incl. islands). Not a border test — it rejects a pin that is
 * clearly not an Indian shop (swapped lat/lng, 0,0, a GPS in another country), nothing finer.
 */
export function isInIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
}

/**
 * Haversine distance between two points in kilometers.
 * Accurate to ~0.3% — plenty for "near me" retailer search.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
