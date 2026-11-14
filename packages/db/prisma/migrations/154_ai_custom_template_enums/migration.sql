-- 154: AI custom-prompt design (T5) — enum values only.
-- docs/tasks/pending/admin-social-design-templates.md §5.
-- NOT APPLIED by the agent; the owner applies it BEFORE the API that uses the values is deployed.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED in the same
-- transaction that added it, and Prisma runs each migration file as one transaction, so the table
-- (155) lives in its own file (same split as 140 -> 141).
--
--   PlanFeatureKey.AI_CUSTOM_TEMPLATE   fails CLOSED: no plan_features row = OFF for every plan.
--   QuotaResourceType.AI_CUSTOM_TEMPLATE METERED in lib/quota.ts: no plan_limits row = limit 0.
--
-- OWNER STEP before turning it on: Admin -> Plan Limits, set AI_CUSTOM_TEMPLATE per plan, and
-- Admin -> Plan Features, enable AI_CUSTOM_TEMPLATE for the plans that get it.
--
-- Rollback: Postgres cannot drop an enum value; leave them (inert without rows).

ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'AI_CUSTOM_TEMPLATE';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'AI_CUSTOM_TEMPLATE';
