-- 098: Staff one-row-per-(retailer_id, phone) unique constraint (FR-4.3)
-- docs/tasks/team-member-access-control.md G6/FR-4.3 — re-adding a
-- deactivated phone previously created a second staff row because there was
-- no uniqueness on (retailer_id, phone). POST /v1/staff now reactivates the
-- existing inactive row; this index makes that contract hold at the DB level.
--
-- De-dupe FIRST: keep the most recent ACTIVE row per (retailer_id, phone),
-- else the most recent row, and delete the rest. The DELETE runs before the
-- unique index exists, so no constraint violation. Staff rows only get
-- hard-deleted here (dup cleanup) — not through kanchuki_app (that path is
-- the explicit purge in the API, which uses the scoped purge role + the
-- F-017 session flag).

-- staff is F-017 trigger-guarded (037: guard_staff_delete blocks any DELETE
-- unless app.allow_hard_delete = 'true' is set in the session). This is a
-- deliberate one-time data-cleanup migration run by a privileged role, so
-- set the session flag first — same bypass the purge cron and the API purge
-- paths use (they wrap the same SET + DELETE in one transaction).
SET app.allow_hard_delete = 'true';

-- Delete every row that has a strictly-better keeper in its (retailer_id,
-- phone) group: an active one over an inactive one, then the newer
-- created_at, then (tiebreak) the lexicographically larger id. The best row
-- per group has no better sibling, so it survives.
DELETE FROM staff a
USING staff b
WHERE a.retailer_id = b.retailer_id
  AND a.phone = b.phone
  AND a.id <> b.id
  AND (
    (b.is_active AND NOT a.is_active)
    OR (b.is_active = a.is_active AND b.created_at > a.created_at)
    OR (b.is_active = a.is_active AND b.created_at = a.created_at AND b.id > a.id)
  );

-- Prisma @@unique([retailer_id, phone]) — generated as a unique index.
CREATE UNIQUE INDEX "staff_retailer_id_phone_key" ON "staff"("retailer_id", "phone");