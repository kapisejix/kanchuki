-- 144: quota_reservations — one row per quota slot reserved at enqueue by a queued job
-- (docs/tasks/pending/quota-reserve-at-enqueue.md, RC-102 follow-up). NOT APPLIED by the
-- agent; the owner applies it.
--
-- The counter (usage_counters / customer_usage_counters) is still the number the limit is
-- checked against. This table only records WHICH job holds WHICH slot, so a refund keyed by
-- job_id is idempotent: the handler's `finally`, the BullMQ `failed` hook and a sweep can all
-- call it and the counter drops once (UPDATE .. WHERE state = 'RESERVED' touches a row once).
--
--   state RESERVED  slot taken at enqueue, job not finished (or not known to be)
--         SPENT     job produced its result; the slot stays used
--         REFUNDED  slot handed back to the counter
--
-- ADDITIVE ONLY: a new table + indexes. No backfill, nothing reads it until the studio-shoot
-- route and job (step 1) ship.
--
-- Scope: retailer_id XOR customer_account_id (CHECK). A shopper try-on later reserves BOTH a
-- retailer row and a customer row for one job_id, so uniqueness is per (job_id, resource_type)
-- within each scope (two partial unique indexes), not on job_id alone. Step 1 only writes
-- retailer rows.
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- SELECT/INSERT/UPDATE on new tables to kanchuki_app. DELETE is not granted and nothing
-- deletes these rows (RC-049): refunds are updates.
-- RLS: same `backend_roles_full_access` policy as 111/136/141, idempotent, skipped with a
-- warning when the backend roles are missing.
--
-- Rollback:
--   DROP TABLE IF EXISTS "quota_reservations";

CREATE TABLE IF NOT EXISTS "quota_reservations" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "retailer_id" TEXT,
    "customer_account_id" TEXT,
    "resource_type" "QuotaResourceType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "quota_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quota_reservations_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "quota_reservations_state_check" CHECK ("state" IN ('RESERVED', 'SPENT', 'REFUNDED')),
    CONSTRAINT "quota_reservations_scope_check" CHECK (("retailer_id" IS NOT NULL) <> ("customer_account_id" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "quota_reservations_retailer_job_key"
  ON "quota_reservations" ("job_id", "resource_type") WHERE "retailer_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "quota_reservations_customer_job_key"
  ON "quota_reservations" ("job_id", "resource_type") WHERE "customer_account_id" IS NOT NULL;
-- The sweep (later step) scans old unfinished reservations only.
CREATE INDEX IF NOT EXISTS "quota_reservations_unfinished_idx"
  ON "quota_reservations" ("created_at") WHERE "state" = 'RESERVED';

DO $$ BEGIN
  ALTER TABLE "quota_reservations" ADD CONSTRAINT "quota_reservations_retailer_id_fkey"
    FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "quota_reservations" ADD CONSTRAINT "quota_reservations_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '144: kanchuki_app/kanchuki_purge missing — RLS policy skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'quota_reservations'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'quota_reservations'
    );
  END IF;
  ALTER TABLE "quota_reservations" ENABLE ROW LEVEL SECURITY;
END $$;
