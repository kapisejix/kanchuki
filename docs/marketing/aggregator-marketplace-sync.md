# Aggregator & Marketplace Sync Architecture

**Status:** Planned (Phase 2 & 3 - Core Enablement & Advanced Features)

**Description:** Unified product catalog with real-time inventory sync, order aggregation, and fee/revenue reconciliation across multiple marketplaces (Meesho, Glroad, Craftsvilla, Instamojo) to expand market reach and prevent overselling.

## Core Principles
- Unified product catalog (single source of truth in Kanchuki DB)
- Real-time inventory sync (prevent overselling)
- Order aggregation (centralized fulfillment view)
- Fee/revenue reconciliation per channel

## Technical Architecture
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

## Key Components
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

## Priority (Ease/Impact)
High (Medium dev effort due to multiple APIs; Very High impact on sales channels)

## Implementation Phase
- Phase 2 (Core Enablement - 8-10 weeks): Start with Meesho & Instamojo (simplest APIs)
- Phase 3 (Advanced Features - 12+ weeks): Full Aggregator Sync (Glroad/Craftsvilla)

## Notes
This feature requires building adapters for each marketplace API and integrating with the existing Kanchuki API gateway and order management system.