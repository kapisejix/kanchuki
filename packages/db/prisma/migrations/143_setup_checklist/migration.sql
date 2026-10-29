-- 143: "Complete your profile" dashboard checklist
-- (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part C).
--
-- ADDITIVE ONLY: two nullable/defaulted columns on existing tables. No backfill.
--
--   support_tickets.setup_item    which checklist item an "Ask Kanchuki team" ticket is for
--                                 (google_place | google_business | facebook | instagram |
--                                  gst | whatsapp_api). NULL for every ordinary ticket.
--   retailers.setup_dismissed     checklist items the owner hid. Hiding only — item STATUS is
--                                 always derived from real data, never stored.
--
-- One OPEN/ASSIGNED request per (retailer, item) is enforced here, in the database, by a
-- partial unique index — the API's idempotency is a courtesy on top (RC-030: a boundary that
-- lives in app code alone can be bypassed by a second code path).
--
-- GRANTS/RLS: both tables already have them; kanchuki_app already has UPDATE/INSERT.
-- Idempotent: IF NOT EXISTS on every statement.
--
-- Rollback:
--   DROP INDEX IF EXISTS "support_tickets_open_setup_item_key";
--   ALTER TABLE "support_tickets" DROP COLUMN IF EXISTS "setup_item";
--   ALTER TABLE "retailers" DROP COLUMN IF EXISTS "setup_dismissed";

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "setup_item" TEXT;

ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "setup_dismissed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_open_setup_item_key"
  ON "support_tickets" ("retailer_id", "setup_item")
  WHERE "setup_item" IS NOT NULL AND "status" IN ('OPEN', 'ASSIGNED');
