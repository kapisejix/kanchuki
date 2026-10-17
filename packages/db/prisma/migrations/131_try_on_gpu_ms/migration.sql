-- 131: F-044 R2 T7 (E11) - try-on GPU usage logging. PROPOSED, NOT APPLIED (owner applies).
--
-- gpu_ms = RunPod executionTime (else worker latency_ms) for a finished job; NULL for
-- failed/unmetered jobs. Additive nullable column: no backfill, no new table, so RLS and
-- grants are unchanged.
--
-- DEPLOY ORDER: apply this BEFORE the API code that writes gpu_ms is deployed, or every
-- try-on completion write fails on the missing column.
--
-- Rollback:
--   ALTER TABLE try_on_jobs DROP COLUMN IF EXISTS gpu_ms;

ALTER TABLE try_on_jobs ADD COLUMN IF NOT EXISTS gpu_ms INTEGER;
