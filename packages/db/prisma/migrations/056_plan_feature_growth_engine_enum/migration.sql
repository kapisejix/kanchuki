-- GROWTH_ENGINE plan-feature gate (F-013): add the enum value ALONE.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that added it ("new enum values must be
-- committed before they can be used"). Prisma wraps each migration in a
-- single transaction, so this value lives in its own migration and the
-- plan_features rows that reference it live in 057 — a separate
-- transaction. Original single-file version in 055 failed with 55P04.

ALTER TYPE "PlanFeatureKey" ADD VALUE 'GROWTH_ENGINE';
