-- 094: Suits Designs — enum values ALONE (docs/tasks/suits-designs.md).
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be used
-- in the same transaction that added it ("new enum values must be committed
-- before they can be used"). The migration runner wraps each migration in one
-- transaction, so these two values live here alone and the plan_features /
-- plan_limits rows that reference them live in 095 — a separate transaction.
-- Same known-good split as 056/057 (GROWTH_ENGINE) and 060/061/062
-- (WHATSAPP_CATALOG_SYNC). Nothing in this migration USES the new values.

ALTER TYPE "PlanFeatureKey" ADD VALUE 'SHOWCASE_DESIGNS';
ALTER TYPE "QuotaResourceType" ADD VALUE 'SHOWCASE_DESIGNS';
