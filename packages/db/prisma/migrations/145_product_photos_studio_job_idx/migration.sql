-- 145: expression index for the quota sweep's "did this studio job leave a photo?" lookup
-- (jobs/quota-reservation-sweep.ts, RC-102 review finding 4). NOT APPLIED by the agent; the
-- owner applies it.
--
-- The sweep asks `metadata #> '{studio,job_id}' = to_jsonb(<job id>)` once per stuck
-- quota_reservations row, up to 500 per run. Without this index that is a sequential scan of
-- product_photos each time (measured 52 ms at 100k rows -> 0.11 ms with the index, scratch DB).
-- The predicate in the sweep is written to match this expression exactly; Postgres only uses an
-- expression index when the query repeats the indexed expression.
--
-- ADDITIVE ONLY. A plain CREATE INDEX briefly blocks writes to product_photos while it builds;
-- on a large table run it as CREATE INDEX CONCURRENTLY from the SQL editor instead (it cannot
-- run inside a transaction block). No schema.prisma change: Prisma cannot express this index.
CREATE INDEX IF NOT EXISTS product_photos_studio_job_id_idx
  ON product_photos ((metadata #> '{studio,job_id}'));
