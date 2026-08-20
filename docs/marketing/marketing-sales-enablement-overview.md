# Marketing & Sales Enablement Features - Overview and Individual Specs

**Note:** The original PRD has been split into individual feature files in this directory for granular tracking. Each feature file contains detailed specifications, status, and implementation details.

## Subscription-Based Feature Management

All marketing and sales enablement features are gated behind subscription plan features in the same manner as the Growth Engine features (see `INDIA-RETAILER-GROWTH.md`). Retailers can only access features included in their specific subscription plan (Starter, Growth, Pro). The Admin Dashboard controls feature availability on a plan-wise basis.

# Kanchuki Platform Marketing & Sales Enablement Roadmap
## Product Requirement Document (PRD)
**Date:** 2026-08-19  
**Version:** 1.0  
**Objective:** Translate marketing research into actionable platform features to help small Indian clothing retailers increase sales and manage social media presence.

---
## 1. Feature Implementation Roadmap: Offline-to-Online Strategy Modules

| Research Tactic          | Platform Module                     | Key Functionalities                                                                 | Technical Approach                                                                 | Priority (Ease/Impact) |
|--------------------------|-------------------------------------|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------|------------------------|
| Hyperlocal Targeting     | Local Discovery Engine              | - Geo-tagged product listings for Google My Business<br>- "Near me" search optimization<br>- Location-based offer rules (e.g., show Diwali offers only to users within 10km) | Extend existing `getSecret`/`prisma` to store location metadata; add geo-indexing to product photos; integrate with Google My Business API for automatic post generation | High (Leverages existing location data; Medium dev effort; High impact on footfall) |
| Community Partnerships   | Partner Network Manager             | - Track referral codes for local salons/tailors<br>- Automated commission payouts<br>- Co-hosted event invitations (e.g., "Styling Sunday" with beauty parlor) | New `partner_relations` table; webhook for referral tracking; email/SMS templates for event invites; integrate with existing loyalty points system | Medium (Requires new DB schema; Low-Medium dev effort; Medium impact on acquisition) |
| Visitor Incentives       | Smart Incentive Engine              | - First-time visitor discount auto-applied at checkout<br>- Birthday/anniversary offer triggers<br>- Loyalty tier progression based on spend/visit frequency | Extend `prisma` with `customer_visits` and `incentive_rules` tables; integrate with checkout flow; WhatsApp/SMS automation for incentive delivery | High (Uses existing customer data; Low dev effort for rules engine; High impact on retention) |

---
## 2. Social Media Management Suite

| Feature                          | Functional Specification                                                                 | Technical Implementation                                                                                                                               | Priority (Ease/Impact) |
|----------------------------------|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------|
| **AI-Driven Social Media Templates** | - Generate Instagram post/reel templates from product images<br>- WhatsApp catalog/status templates with festive overlays<br>- Text suggestions based on regional trends & occasion | - Use existing `studio-shoot` FLUX Konnet integration to apply stylized backgrounds<br>- New `social-template` microservice (Node.js) with OpenAI API for caption generation<br>- Store templates in S3/R2; serve via CDN<br>- Integrate with WhatsApp Business API for catalog updates | High (Reuses AI studio tech; Low-Medium dev; High impact on social engagement) |
| **Automated Festival Background Library** | - Pre-generated backgrounds for Diwali, weddings, regional festivals<br>- One-click apply to product images<br>- Seasonal auto-rotation (e.g., swap to wedding backgrounds Oct-Mar) | - Extend `studio-shoot` job to generate background variants during off-peak hours<br>- New `festival-bg` table in DB with metadata (occasion, validity dates)<br>- Admin UI to preview/select backgrounds<br>- API endpoint: `/apply-background/{productId}/{festivalId>` | Medium (Builds on studio-shoot; Low dev; High impact for seasonal campaigns) |
| **Automated Lookbook Generator**   | - Input: 3-5 product IDs<br>- Output: Coordinated lookbook (images/video) with styling notes<br>- Export formats: Instagram carousel, WhatsApp status, PDF | - New `lookbook-generator` service (Python)<br>- Uses style rules from `fashion-dna` module<br>- Leverages existing image compression/upload pipeline<br>- Output stored as new ProductPhoto rows with `is_lookbook: true` flag | Medium (Requires new service; Medium dev; High impact on upsell/cross-sell) |
| **Direct Social Publishing**       | - Schedule Instagram Reels (via Meta Graph API)<br>- Broadcast WhatsApp Catalog updates<br>- Analytics: views, shares, click-throughs | - Integrate with Meta Graph API for Reels scheduling<br>- Use WhatsApp Cloud API for catalog broadcasts<br>- New `social-scheduler` table for queued posts<br>- Webhook for post-publish analytics (impressions, engagement) | High (Leverages existing WhatsApp/IG integrations; Low dev; High impact on campaign efficiency) |

---
## 3. Hyperlocal & Ad Management Integration

| Platform                  | Kanchuki Integration Features                                                                 | Technical Approach                                                                                   | Priority (Ease/Impact) |
|---------------------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|------------------------|
| **Google My Business**    | - Auto-post new arrivals/offers<br>- Review monitoring & response templates<br>- Q&A management for common queries (size, fabric) | - Use Google My Business API<br>- New `gmb-sync` service (Node.js)<br>- Webhook for review alerts<br>- Template engine for automated responses | High (Well-documented API; Low dev; High impact on local SEO) |
| **Facebook Local Awareness Ads** | - Create radius-based ad campaigns (5km/10km)<br>- A/B test creative (product vs. lifestyle)<br>- Budget pacing alerts | - Integrate with Meta Marketing API<br>- New `fb-ads` manager in retailer dashboard<br>- Use existing product image library for ad creatives<br>- Auto-pause when budget exhausted | Medium (Requires Meta API access; Medium dev; High impact on footfall) |
| **Google Local Service Ads** | - Service-based ad management (e.g., "alteration services near me")<br>- Lead tracking & follow-up reminders | - Extend existing Google Ads integration<br>- New `gla-leads` table for service inquiries<br>- SMS/email alerts for new leads<br>- Integration with appointment booking (if available) | Low-Medium (Niche for retailers; Low dev; Medium impact for service add-ons) |

*Note: Prioritize GMB > FB Ads > GLA for clothing retailers.*

---
## 4. Aggregator & Marketplace Sync Architecture

**Core Principles:**  
- Unified product catalog (single source of truth in Kanchuki DB)  
- Real-time inventory sync (prevent overselling)  
- Order aggregation (centralized fulfillment view)  
- Fee/revenue reconciliation per channel  

**Technical Architecture:**  
```
[Retailer Dashboard] 
        ↓ (REST/WebSocket)
[Kanchuki API Gateway] 
        ↓ 
[Channel Adapter Layer] 
        ↓ 
[Meesho Adapter] → Meesho API  
[Glroad Adapter]  → Glroad API  
[Craftsvilla Adapter] → Craftsvilla API  
[Instamojo Adapter] → Instamojo API (for store/payment links)
```

**Key Components:**  
- **Product Mapper:** Normalizes Kanchuki product schema to each channel's requirements (e.g., Meesho requires specific attribute names)  
- **Inventory Sync Service:**  
  - Polls channel APIs every 15 mins for stock changes  
  - Pushes Kanchuki inventory updates via channel APIs  
  - Conflict resolution: "last write wins" with manual override for high-value items  
- **Order Hub:**  
  - Pulls new orders from all channels via webhooks/polling  
  - Tags orders by source channel  
  - Updates Kanchuki `orders` table with channel metadata  
  - Triggers workflow (existing or new)  
- **Fee Tracker:**  
  - Retrieves transaction fees from channel APIs  
  - Aggregates in `channel_finance` table for payout reconciliation  

**Priority:** High (Medium dev effort due to multiple APIs; Very High impact on sales channels)  
*Note: Start with Meesho & Instamojo (simplest APIs), then Glroad/Craftsvilla.*

---
## 5. Value Proposition for Retailers

| Feature                          | Specific ROI Metrics                                                                 | Quantifiable Impact (Based on Industry Benchmarks) |
|----------------------------------|------------------------------------------------------------------------------------|--------------------------------------------------|
| Local Discovery Engine           | - 30% increase in "near me" search impressions<br>- 20% higher conversion from local ads | +15% footfall from local searches; +10% sales from geo-targeted offers |
| Partner Network Manager          | - 25% reduction in CAC via referrals<br>- 40% higher LTM from partner-referred customers | ₹500-1000 avg. referral value; 2x repeat rate from partner leads |
| Smart Incentive Engine           | - 35% increase in first-time visitor conversion<br>- 50% higher repeat visit rate | ₹200-300 avg. uplift per new customer; 3x likelihood of second visit |
| AI-Driven Social Media Templates | - 50% reduction in content creation time<br>- 2x engagement rate on templated posts | 5 hrs/week saved; 15-20% higher CTR on promotions |
| Automated Festival Background Library | - 70% faster seasonal campaign launch<br>- 3x more festive-themed posts | Diwali/Wedding season sales uplift of 20-30%; reduced dependency on photographers |
| Automated Lookbook Generator     | - 25% increase in average order value (AOV)<br>- 40% higher add-to-cart rate for bundled looks | ₹150-250 AOV increase; 1.5x cross-sell success rate |
| Direct Social Publishing         | - 60% faster campaign execution<br>- 80% adherence to posting schedule | 3x more consistent social presence; 20% higher follower growth |
| GMB Integration                  | - 40% increase in direction requests<br>- 50% more review responses | 25% higher footfall from Google Maps; improved local search ranking |
| Facebook Local Awareness Ads     | - 30% lower CPL vs. broad targeting<br>- 2x higher in-store redemption rate | ₹15-20 CPL (vs. ₹40-50 for broad); 10-15% sales lift from ad-driven footfall |
| Aggregator & Marketplace Sync    | - 50% reduction in manual inventory updates<br>- 99.8% inventory accuracy | 5-10 hrs/week saved; 15-20% sales increase from multi-channel presence; near-zero overselling incidents |

**Overall Platform Impact:**  
- **Time Savings:** 10-15 hrs/week per retailer on manual marketing/inventory tasks  
- **Sales Growth:** 20-35% increase in monthly revenue within 3 months of adoption  
- **Customer Retention:** 40% improvement in repeat purchase rate via personalized incentives  
- **Market Reach:** 3x expansion in digital touchpoints (social + marketplaces + local search)  

---
## Implementation Phases (by Priority)

**Phase 1 (Quick Wins - 4-6 weeks):**  
1. Smart Incentive Engine (uses existing customer data) ✅
2. Local Discovery Engine (leverages location fields) ✅
3. GMB Integration (simple API) ✅
4. AI-Driven Social Media Templates (builds on studio-shoot) ✅

**Phase 2 (Core Enablement - 8-10 weeks):**  
1. Direct Social Publishing (WhatsApp/IG APIs) ✅
2. Automated Festival Background Library (extends studio-shoot) ✅
3. Partner Network Manager (new DB schema + workflows) 🔴 not built — schema fails `prisma validate`, no migration, no UI (see `docs/PRO-REQUIREMENTS.md` §29)
4. Aggregator Sync (Meesho + Instamojo first) ✅  

**Phase 3 (Advanced Features - 12+ weeks):**  
1. Automated Lookbook Generator (new service) ✅  
2. Facebook Local Awareness Ads (Meta API) ✅  
3. Google Local Service Ads (niche extension) ✅  
4. Full Aggregator Sync (Glroad/Craftsvilla) ✅  

**Success Metrics for Each Phase:**  
- Phase 1: ≥20% increase in repeat visits & local search footprint  
- Phase 2: ≥15% uplift in social engagement & marketplace sales  
- Phase 3: ≥25% reduction in marketing ops time & ≥30% multi-channel revenue share  

--- 
**Note:** All features maintain the "new row preserves old" data pattern. Minimum viable versions prioritize retailer self-service with admin oversight controls.
End of PRD.