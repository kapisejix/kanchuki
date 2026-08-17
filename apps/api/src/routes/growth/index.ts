import type { FastifyPluginAsync } from 'fastify';
import { growthBookingRoutes } from './growth-bookings.js';
import { growthCampaignRoutes } from './growth-campaigns.js';
import { growthInventoryRoutes } from './growth-inventory.js';
import { growthKhataRoutes } from './growth-khata.js';
import { growthPromotionRoutes } from './growth-promotions.js';
import { growthReferralRoutes } from './growth-referrals.js';
import { growthSupplierRoutes } from './growth-suppliers.js';
import { growthTranslateRoutes } from './growth-translate.js';
import { growthUdharRoutes } from './growth-udhar.js';
import { growthVideoRoutes } from './growth-videos.js';

// India Retailer Growth Engine (docs/INDIA-RETAILER-GROWTH.md).
// Sub-modules match the roadmap sections:
//  - campaigns  → D (festival), G (reactivation), S (A/B), R (analytics)
//  - promotions → F (smart promotion engine)
//  - referrals  → C (customer referral program)
//  - khata      → H (daily P&L ledger)
//  - suppliers  → K (supplier management)
//  - bookings   → L (showroom / try-on room booking)
//  - udhar      → O (Indian credit tracking)
//  - inventory  → J (inventory intelligence alerts)
//  - videos     → Q (product video support)
//  - translate  → M (multi-language AI descriptions)
export const growthRoutes: FastifyPluginAsync = async (server) => {
  await server.register(growthCampaignRoutes);
  await server.register(growthPromotionRoutes);
  await server.register(growthReferralRoutes);
  await server.register(growthKhataRoutes);
  await server.register(growthSupplierRoutes);
  await server.register(growthBookingRoutes);
  await server.register(growthUdharRoutes);
  await server.register(growthInventoryRoutes);
  await server.register(growthVideoRoutes);
  await server.register(growthTranslateRoutes);
};
