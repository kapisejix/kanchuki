import type { FastifyPluginAsync } from 'fastify';
import { growthAiCampaignRoutes } from './growth-ai-campaign.js';
import { growthBookingRoutes } from './growth-bookings.js';
import { growthCampaignRoutes } from './growth-campaigns.js';
import { growthInventoryRoutes } from './growth-inventory.js';
import { growthPromotionRoutes } from './growth-promotions.js';
import { growthReferralRoutes } from './growth-referrals.js';
import { growthSizeRoutes } from './growth-sizes.js';
import { growthSupplierRoutes } from './growth-suppliers.js';
import { growthTranslateRoutes } from './growth-translate.js';
import { growthVideoRoutes } from './growth-videos.js';

// India Retailer Growth Engine (docs/INDIA-RETAILER-GROWTH.md).
// Sub-modules match the roadmap sections:
//  - campaigns  → D (festival), G (reactivation), S (A/B), R (analytics), E (AI assistant)
//  - promotions → F (smart promotion engine)
//  - referrals  → C (customer referral program)
//  - suppliers  → K (supplier management)
//  - bookings   → L (showroom / try-on room booking)
//  - inventory  → J (inventory intelligence alerts)
//  - videos     → Q (product video support)
//  - translate  → M (multi-language AI descriptions)
//  - ai-campaign → E (AI campaign assistant)
// (khata H + udhar O removed from scope 2026-08-17 — no modules for them)
export const growthRoutes: FastifyPluginAsync = async (server) => {
  await server.register(growthAiCampaignRoutes);
  await server.register(growthCampaignRoutes);
  await server.register(growthPromotionRoutes);
  await server.register(growthReferralRoutes);
  await server.register(growthSizeRoutes); // N — size & fit recommendation
  await server.register(growthSupplierRoutes);
  await server.register(growthBookingRoutes);
  await server.register(growthInventoryRoutes);
  await server.register(growthVideoRoutes);
  await server.register(growthTranslateRoutes);
};
