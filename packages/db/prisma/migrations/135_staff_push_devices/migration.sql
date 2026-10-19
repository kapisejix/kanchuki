-- 135: Retailer-app push devices (F-046, docs/tasks/pending/staff-push-notifications.md, slice 1).
--
-- One row per Expo push token registered by the retailer app (owner or Staff).
-- ADDITIVE ONLY: one new table, indexes, FK, RLS. Nothing existing is altered.
--
-- No customer data is stored here. Recipients of a push are resolved from
-- Staff.role / Staff.is_active at SEND time, so a demoted or removed person stops
-- getting pings without re-registering; staff_id is therefore a plain nullable
-- column (null = the owner's own login) with no FK to staff.
--
-- No hard deletes from the app (RC-049): unregister and Expo's DeviceNotRegistered
-- both set disabled_at, and a re-register of the same token upserts it back to
-- active. kanchuki_app gets SELECT/INSERT/UPDATE from ALTER DEFAULT PRIVILEGES
-- (scripts/setup-role-separation.sql §19.1), which is all that needs. kanchuki_purge
-- gets DELETE for the retailer hard-delete path only (FK also cascades; the explicit
-- delete in purge-retailer-now.ts is belt-and-braces, per 084/127).
--
-- RLS follows 126/127/133: policy for the two backend roles first, then ENABLE, so
-- there is never a window where RLS is on and the API sees 0 rows (RC-030).
-- Idempotent: table, indexes and FK are guarded.

CREATE TABLE IF NOT EXISTS "staff_push_devices" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "expo_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_push_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_push_devices_platform_chk" CHECK ("platform" IN ('android', 'ios'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_push_devices_expo_token_key"
  ON "staff_push_devices"("expo_token");
CREATE INDEX IF NOT EXISTS "staff_push_devices_retailer_id_disabled_at_idx"
  ON "staff_push_devices"("retailer_id", "disabled_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_push_devices_retailer_id_fkey') THEN
    ALTER TABLE "staff_push_devices" ADD CONSTRAINT "staff_push_devices_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '135: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT DELETE ON "staff_push_devices" TO kanchuki_purge;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'staff_push_devices'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'staff_push_devices'
    );
  END IF;

  ALTER TABLE "staff_push_devices" ENABLE ROW LEVEL SECURITY;
END $$;
