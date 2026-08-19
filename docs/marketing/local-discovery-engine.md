# Local Discovery Engine

**Status:** Done (Phase 1 - Quick Wins)

**Description:** Geo-tagged product listings for Google My Business, "near me" search optimization, and location-based offer rules to drive foot traffic and local sales.

## Key Functionalities
- Geo-tagged product listings for Google My Business
- "Near me" search optimization
- Location-based offer rules (e.g., show Diwali offers only to users within 10km)

## Technical Approach
Extend existing `getSecret`/`prisma` to store location metadata; add geo-indexing to product photos; integrate with Google My Business API for automatic post generation

## Priority (Ease/Impact)
High (Leverages existing location data; Medium dev effort; High impact on footfall)

## Implementation Phase
Phase 1 (Quick Wins - 4-6 weeks)

## Notes
This feature leverages the existing location fields (latitude, longitude) added to the Retailer model.