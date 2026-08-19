# Automated Festival Background Library

**Status:** Planned (Phase 2 - Core Enablement)

**Description:** Pre-generated backgrounds for festivals with one-click apply to product images and seasonal auto-rotation to streamline seasonal campaign creation.

## Functional Specification
- Pre-generated backgrounds for Diwali, weddings, regional festivals
- One-click apply to product images
- Seasonal auto-rotation (e.g., swap to wedding backgrounds Oct-Mar)

## Technical Implementation
- Extend `studio-shoot` job to generate background variants during off-peak hours
- New `festival-bg` table in DB with metadata (occasion, validity dates)
- Admin UI to preview/select backgrounds
- API endpoint: `/apply-background/{productId}/{festivalId}`

## Priority (Ease/Impact)
Medium (Builds on studio-shoot; Low dev; High impact for seasonal campaigns)

## Implementation Phase
Phase 2 (Core Enablement - 8-10 weeks)

## Notes
This feature extends the existing studio-shoot functionality and adds a new database table for festival background metadata.