# Smart Incentive Engine

**Status:** Done (Phase 1 - Quick Wins)

**Description:** Automate visitor incentives including first-time visitor discounts, birthday/anniversary offers, and loyalty tier progression to increase conversion and retention.

## Key Functionalities
- First-time visitor discount auto-applied at checkout
- Birthday/anniversary offer triggers
- Loyalty tier progression based on spend/visit frequency

## Technical Approach
Extend `prisma` with `customer_visits` and `incentive_rules` tables; integrate with checkout flow; WhatsApp/SMS automation for incentive delivery

## Priority (Ease/Impact)
High (Uses existing customer data; Low dev effort for rules engine; High impact on retention)

## Implementation Phase
Phase 1 (Quick Wins - 4-6 weeks)

## Notes
This feature uses the newly added `CustomerVisit` and `IncentiveRule` models in the Prisma schema.