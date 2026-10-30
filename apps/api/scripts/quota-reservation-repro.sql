-- RC-102 review repro: findings 2 and 4. SCRATCH DATABASE ONLY - owner runs it, never prod.
--   psql "$SCRATCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/scripts/quota-reservation-repro.sql
-- Needs a role that may SET session_replication_role (superuser / scratch owner) so the FKs to
-- retailers can be skipped. Everything runs in one transaction and is rolled back at the end.
-- Finding 1 is a pure TypeScript decision (see the KNOWN GAP tests in jobs/tryon.test.ts and
-- jobs/quota-reservation-sweep.test.ts); it has no SQL part.
-- The refund / mark-spent statements below are copies of refundJobQuota / markJobQuotaSpent in
-- apps/api/src/lib/quota.ts. If those change, change these.

BEGIN;
SET LOCAL session_replication_role = replica;

-- ── Finding 2: sweep refunds a slot, the late job then "spends" it for free ─────────────────
INSERT INTO usage_counters (id, retailer_id, resource_type, period_start, count, updated_at)
VALUES ('repro_uc', 'repro_ret', 'STUDIO_SHOOT', date_trunc('month', now()), 1, now());

INSERT INTO quota_reservations (id, job_id, retailer_id, resource_type, period_start, amount, created_at)
VALUES ('repro_qr', 'repro_f2', 'repro_ret', 'STUDIO_SHOOT', date_trunc('month', now()), 1, now() - interval '7 hours');

-- 1. sweep (job looked dead after 6 h, no photo): refund
WITH r AS (
  UPDATE quota_reservations SET state = 'REFUNDED', refunded_at = now()
  WHERE job_id = 'repro_f2' AND resource_type = 'STUDIO_SHOOT'::"QuotaResourceType"
    AND retailer_id IS NOT NULL AND state = 'RESERVED'
  RETURNING retailer_id, resource_type, period_start, amount
)
UPDATE usage_counters u SET count = GREATEST(u.count - r.amount, 0), updated_at = now()
FROM r WHERE u.retailer_id = r.retailer_id AND u.resource_type = r.resource_type
  AND u.period_start = r.period_start;

-- 2. the worker comes back and the job finishes: markJobQuotaSpent
DO $$
DECLARE n int; st text; c int;
BEGIN
  UPDATE quota_reservations SET state = 'SPENT'
  WHERE job_id = 'repro_f2' AND resource_type = 'STUDIO_SHOOT'::"QuotaResourceType"
    AND retailer_id IS NOT NULL AND state = 'RESERVED';
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT state INTO st FROM quota_reservations WHERE job_id = 'repro_f2';
  SELECT count INTO c FROM usage_counters WHERE retailer_id = 'repro_ret';
  RAISE NOTICE 'F2: mark-spent rows=% state=% counter=%', n, st, c;
  IF n = 0 AND st = 'REFUNDED' AND c = 0 THEN
    RAISE NOTICE 'F2 REPRODUCED: job produced a result, slot stays refunded (free run, counter 0)';
  ELSE
    RAISE NOTICE 'F2 NOT reproduced';
  END IF;
END $$;

-- ── Finding 4: per-row JSON-path lookup on product_photos ─────────────────────────────────
-- A temp table with the same shape as the lookup uses (id + jsonb metadata) stands in for
-- product_photos so no NOT NULL columns have to be faked. For the real table, run the two
-- EXPLAINs against it on a scratch copy and compare.
CREATE TEMP TABLE pp_probe (id text PRIMARY KEY, metadata jsonb);
INSERT INTO pp_probe
SELECT 'p' || g,
       CASE WHEN g % 10 = 0
            THEN jsonb_build_object('studio', jsonb_build_object('job_id', 'job_' || g))
            ELSE '{}'::jsonb END
FROM generate_series(1, 100000) g;
ANALYZE pp_probe;

\echo '--- F4 before: expect Seq Scan on pp_probe (one of these per stuck row, up to 500 per sweep) ---'
EXPLAIN ANALYZE
SELECT id FROM pp_probe WHERE metadata #> '{studio,job_id}' = to_jsonb('job_none'::text) LIMIT 1;

-- Note: a GIN jsonb_path_ops index would NOT help this predicate (it serves @>, not #> =).
-- An expression btree index does, if the query's expression matches it exactly.
CREATE INDEX pp_probe_studio_job_idx ON pp_probe ((metadata #> '{studio,job_id}'));
ANALYZE pp_probe;

\echo '--- F4 after: expect Index Scan / Bitmap Index Scan on pp_probe_studio_job_idx ---'
EXPLAIN ANALYZE
SELECT id FROM pp_probe WHERE metadata #> '{studio,job_id}' = to_jsonb('job_none'::text) LIMIT 1;

-- Before relying on the index for the real table, turn on Prisma's query log, run the sweep once,
-- and copy the exact SQL it sends for `metadata: { path: ['studio','job_id'], equals: ... }`;
-- the index expression must match that SQL's expression.

ROLLBACK;
