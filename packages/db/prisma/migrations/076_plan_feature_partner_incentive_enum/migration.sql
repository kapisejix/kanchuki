-- PARTNER_NETWORK + INCENTIVE_ENGINE plan-feature gate (migration 066 created
-- the partners/incentive_rules tables but never added these two values to
-- the PlanFeatureKey enum — the enum-add step, unlike WHATSAPP_CATALOG_SYNC's
-- 061/062 split, was simply never written). Prisma's hasFeature() check
-- casts the feature_key param to this enum type before it can even run the
-- "no row = OFF" fail-closed logic, so a missing label crashes with
-- Postgres 22P02 (invalid input value for enum) instead of a clean 403 —
-- surfaced to retailers as "Something went wrong" on Add Partner.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that added it, so the plan_features rows
-- that reference these values live in 077 — a separate transaction.

ALTER TYPE "PlanFeatureKey" ADD VALUE 'PARTNER_NETWORK';
ALTER TYPE "PlanFeatureKey" ADD VALUE 'INCENTIVE_ENGINE';
