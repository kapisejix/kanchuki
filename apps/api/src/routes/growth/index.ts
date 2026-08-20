import type { FastifyPluginAsync } from 'fastify';
import { growthAiCampaignRoutes } from './growth-ai-campaign.js';
import { growthBackgroundRoutes } from './growth-backgrounds.js';
import { growthBookingRoutes } from './growth-bookings.js';
import { growthCampaignRoutes } from './growth-campaigns.js';
import { growthGstRoutes } from './growth-gst.js';
import { growthIncentiveRoutes } from './growth-incentives.js';
import { growthInventoryRoutes } from './growth-inventory.js';
import { growthLookbookRoutes } from './growth-lookbooks.js';
import { growthPromotionRoutes } from './growth-promotions.js';
import { growthReferralRoutes } from './growth-referrals.js';
import { growthSeasonalRoutes } from './growth-seasonal.js';
import { growthSizeRoutes } from './growth-sizes.js';
import { growthSocialTemplateRoutes } from './growth-social-templates.js';
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
  await server.register(growthBackgroundRoutes); // Phase 4 — festival background library
  await server.register(growthCampaignRoutes);
  await server.register(growthGstRoutes); // GST Report (retailer-facing)
  await server.register(growthIncentiveRoutes);
  await server.register(growthLookbookRoutes); // Phase 6 — lookbook generator
  await server.register(growthPromotionRoutes);
  await server.register(growthReferralRoutes);
  await server.register(growthSizeRoutes); // N — size & fit recommendation
  await server.register(growthSupplierRoutes);
  await server.register(growthBookingRoutes);
  await server.register(growthInventoryRoutes);
  await server.register(growthVideoRoutes);
  await server.register(growthTranslateRoutes);
  await server.register(growthSeasonalRoutes); // R — seasonal analytics
  await server.register(growthSocialTemplateRoutes); // Phase 5 — AI social media templates
};
