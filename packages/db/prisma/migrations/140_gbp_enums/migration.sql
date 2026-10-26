-- 140: Google Business Profile reviews — enum values only
-- (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part B).
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED in the same
-- transaction that added it, and Prisma runs each migration file as one transaction, so
-- the rows that use these values live in 142 (same split as 128 -> 129).
--
--   GOOGLE_BUSINESS_PROFILE  PlanFeatureKey      on/off per plan, fails CLOSED (no row = OFF)
--   GBP_REVIEW_REPLY         QuotaResourceType   replies posted to Google reviews per month
--
--   GOOGLE                   IntegrationCategory the shared Kanchuki Google identity's encrypted
--                            refresh token + settings live in integration_settings (F-012)
--
-- Rollback: Postgres cannot drop an enum value; leave them (they are inert without rows).

ALTER TYPE "IntegrationCategory" ADD VALUE IF NOT EXISTS 'GOOGLE';
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'GOOGLE_BUSINESS_PROFILE';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'GBP_REVIEW_REPLY';
