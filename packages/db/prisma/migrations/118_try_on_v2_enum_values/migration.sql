-- 118_try_on_v2_enum_values
--
-- F-039 Phase 2 (docs/tasks/pending/catvton-runpod-tryon-launch.md) — the two
-- enum values that gate and meter the rebuilt CatVTON try-on. This file is
-- deliberately ENUM-ONLY, and 119 creates the tables that use them.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED
-- in the same transaction that added it, and Prisma runs each migration file as
-- one transaction. 119's seed rows INSERT 'TRY_ON_GENERATION', so folding this
-- into it would abort with `unsafe use of new value of enum type` — exactly how
-- growth's 055 had to be split into 055/056/057 and catalog sync's into
-- 060/061/062. Same split as suits-designs' 094 (enums) / 095 (tables).
--
-- ADD VALUE only appends to the type. That is also why these two are at the END
-- of their enums in schema.prisma rather than next to the lookalikes:
--
--   VIRTUAL_TRY_ON   (@deprecated, migration 082) — stays dead, do NOT reuse.
--   TRY_ON          (@deprecated, migration 082) — stays dead, do NOT reuse.
--
-- Both new values are the point of "build now, launch later": `PlanFeature.enabled`
-- defaults false and hasFeature() fails CLOSED, so F-039 is invisible on mobile
-- and customer web until an admin ticks VIRTUAL_TRY_ON_V2 in Plan Feature Matrix.

ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'VIRTUAL_TRY_ON_V2';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'TRY_ON_GENERATION';
