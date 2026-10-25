-- 138: Customer Web Push subscriptions (F-036 Phase B,
-- docs/tasks/pending/customer-pwa-push-notifications.md §7).
--
-- One row per browser push subscription, owned by a verified passport account.
-- ADDITIVE ONLY: one new table, indexes, FK, RLS. Nothing existing is altered.
--
-- Which stores may notify a subscription is NOT stored here: it is resolved at
-- send time from customer_store_visits (visited + is_muted = false), so muting a
-- store takes effect without touching this table.
--
-- No hard deletes from the app (RC-049): unsubscribe, passport delete and a
-- 404/410 from the push service all set disabled_at; a re-subscribe of the same
-- endpoint upserts it back to active (and to the account now signed in).
-- kanchuki_app gets SELECT/INSERT/UPDATE from ALTER DEFAULT PRIVILEGES
-- (scripts/setup-role-separation.sql §19.1). The customer_account_id FK is
-- ON DELETE CASCADE, so no purge list needs this table (RC-050); kanchuki_purge
-- still gets DELETE as belt-and-braces, per 135.
--
-- passport_session_id is the session that subscribed (FK ON DELETE SET NULL). The
-- send job requires that session unrevoked and unexpired, so logging out on the
-- device stops its pushes; an expired/deleted session nulls it and pushes stop.
--
-- RLS follows 126/127/133/135: policy for the two backend roles first, then
-- ENABLE (RC-030). Idempotent: table, indexes and FK are guarded.

CREATE TABLE IF NOT EXISTS "customer_push_subscriptions" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "passport_session_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- The first draft of 138 (0a875950) had no passport_session_id and was hand-
-- applied in prod on 2026-10-25, so CREATE TABLE IF NOT EXISTS above skips it
-- there. Add the column explicitly so the FK below can be created.
ALTER TABLE "customer_push_subscriptions" ADD COLUMN IF NOT EXISTS "passport_session_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_push_subscriptions_endpoint_key"
  ON "customer_push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "customer_push_subscriptions_customer_account_id_disabled_at_idx"
  ON "customer_push_subscriptions"("customer_account_id", "disabled_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_push_subscriptions_customer_account_id_fkey') THEN
    ALTER TABLE "customer_push_subscriptions" ADD CONSTRAINT "customer_push_subscriptions_customer_account_id_fkey"
      FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_push_subscriptions_passport_session_id_fkey') THEN
    ALTER TABLE "customer_push_subscriptions" ADD CONSTRAINT "customer_push_subscriptions_passport_session_id_fkey"
      FOREIGN KEY ("passport_session_id") REFERENCES "passport_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '138: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT DELETE ON "customer_push_subscriptions" TO kanchuki_purge;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'customer_push_subscriptions'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'customer_push_subscriptions'
    );
  END IF;

  ALTER TABLE "customer_push_subscriptions" ENABLE ROW LEVEL SECURITY;
END $$;
