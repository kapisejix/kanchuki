-- WHATSAPP_CATALOG_SYNC plan-feature gate (Phase II / F-307): add the enum
-- value ALONE.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that added it ("new enum values must be
-- committed before they can be used"). Prisma wraps each migration in a
-- single transaction, so this value lives in its own migration and the
-- plan_features rows that reference it live in 062 — a separate
-- transaction. Same split as growth's 056/057; the original single-file
-- version (in 060) would have failed with 55P04.

ALTER TYPE "PlanFeatureKey" ADD VALUE 'WHATSAPP_CATALOG_SYNC';
