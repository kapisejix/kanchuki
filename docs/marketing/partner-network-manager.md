# Partner Network Manager

**Status:** 🔴 Not built — API route exists but is unreachable: `schema.prisma` fails `npx prisma validate` (invalid inline enum syntax on `Partner.commission_type` / `PartnerReferral.status`), no migration applied, `PARTNER_NETWORK` missing from `PlanFeatureKey`, no admin/mobile UI. Full gap analysis: `docs/marketing/WIRING-AUDIT-2026-08-20.md`. Fix plan + acceptance criteria: `docs/PRO-REQUIREMENTS.md` §29.

**Description:** Track referral codes for local partners, automate commission payouts, and manage co-hosted event invitations to drive acquisition through community partnerships.

## Key Functionalities
- Track referral codes for local salons/tailors
- Automated commission payouts
- Co-hosted event invitations (e.g., "Styling Sunday" with beauty parlor)

## Technical Approach
New `partner_relations` table; webhook for referral tracking; email/SMS templates for event invites; integrate with existing loyalty points system

## Priority (Ease/Impact)
Medium (Requires new DB schema; Low-Medium dev effort; Medium impact on acquisition)

## Implementation Phase
Phase 2 (Core Enablement - 8-10 weeks)

## Notes
This feature requires a new database schema for partner relations and integration with the existing loyalty points system.