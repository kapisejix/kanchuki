# Direct Social Publishing

**Status:** Planned (Phase 2 - Core Enablement)

**Description:** Schedule Instagram Reels, broadcast WhatsApp Catalog updates, and track analytics to improve campaign efficiency and social media presence.

## Functional Specification
- Schedule Instagram Reels (via Meta Graph API)
- Broadcast WhatsApp Catalog updates
- Analytics: views, shares, click-throughs

## Technical Implementation
- Integrate with Meta Graph API for Reels scheduling
- Use WhatsApp Cloud API for catalog broadcasts
- New `social-scheduler` table for queued posts
- Webhook for post-publish analytics (impressions, engagement)

## Priority (Ease/Impact)
High (Leverages existing WhatsApp/IG integrations; Low dev; High impact on campaign efficiency)

## Implementation Phase
Phase 2 (Core Enablement - 8-10 weeks)

## Notes
This feature leverages existing WhatsApp and Instagram integrations and adds a new social-scheduler table for queued posts.