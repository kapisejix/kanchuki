-- 170_style_similar_quota
--
-- My Style Phase 2 (docs/tasks/pending/customer-profile-research.md §9, owner decision D5):
-- Find similar gets its own customer quota, separate from the selfie read (STYLE_ANALYSIS).
-- ENUM ONLY, run on its own: PG 55P04, a new enum value cannot be used in the transaction
-- that added it. 171 seeds the limit row and must run AFTER this one, as a separate run.
--
-- NOT APPLIED by the agent; the owner applies it.
-- ROLLBACK: Postgres cannot drop an enum value. Leave it (unused values are harmless), or
-- recreate the type without it once no row uses it.

ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'STYLE_SIMILAR';
