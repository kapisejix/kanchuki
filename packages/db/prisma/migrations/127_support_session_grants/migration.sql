-- 127: Support-session consent grants (docs/tasks/pending/support-session-access.md, slice 1).
--
-- Kanchuki staff may act inside a retailer account only with that retailer's
-- in-app approval. One row per session. Decisions (owner, 2026-10-15):
--   * consent channel = in-app approve (no OTP/SMS)
--   * 24 h hard cap, no extension — a new session needs a new row + approval
--
-- Rows are an audit record and are NEVER deleted by the app: ending a session
-- is status = 'REVOKED'. So kanchuki_app gets no DELETE (RC-049 does not apply
-- — there is no delete caller). kanchuki_purge gets DELETE for the retailer
-- hard-delete path only (FKs also cascade; explicit delete is belt-and-braces
-- per migration 084's convention).
--
-- ALTER TYPE ... ADD VALUE cannot be USED in the same transaction that adds it
-- (55P04, see 064/118). Nothing below uses the new TicketType values; the
-- table's enums are brand-new types, so this is safe in one file.
--
-- Idempotent where Postgres allows: ADD VALUE IF NOT EXISTS; types, table,
-- indexes and FKs are guarded; RLS follows 126 (policy first, then ENABLE).

ALTER TYPE "TicketType" ADD VALUE IF NOT EXISTS 'DEMO';
ALTER TYPE "TicketType" ADD VALUE IF NOT EXISTS 'GROWTH_SETUP';
ALTER TYPE "TicketType" ADD VALUE IF NOT EXISTS 'MAINTENANCE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportSessionScope') THEN
    CREATE TYPE "SupportSessionScope" AS ENUM ('DEMO', 'GROWTH', 'MAINTENANCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportSessionStatus') THEN
    CREATE TYPE "SupportSessionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "support_session_grants" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "scope" "SupportSessionScope" NOT NULL,
    "status" "SupportSessionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,

    CONSTRAINT "support_session_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_session_grants_retailer_id_status_idx"
  ON "support_session_grants"("retailer_id", "status");
CREATE INDEX IF NOT EXISTS "support_session_grants_ticket_id_idx"
  ON "support_session_grants"("ticket_id");
CREATE INDEX IF NOT EXISTS "support_session_grants_team_member_id_idx"
  ON "support_session_grants"("team_member_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_session_grants_ticket_id_fkey') THEN
    ALTER TABLE "support_session_grants" ADD CONSTRAINT "support_session_grants_ticket_id_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_session_grants_retailer_id_fkey') THEN
    ALTER TABLE "support_session_grants" ADD CONSTRAINT "support_session_grants_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_session_grants_team_member_id_fkey') THEN
    ALTER TABLE "support_session_grants" ADD CONSTRAINT "support_session_grants_team_member_id_fkey"
      FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Roles + RLS (same two-part shape as 111/126; skipped with a WARNING when the
-- backend roles are missing, because RLS without the policy returns 0 rows).
DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '127: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT DELETE ON "support_session_grants" TO kanchuki_purge;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'support_session_grants'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'support_session_grants'
    );
  END IF;

  ALTER TABLE "support_session_grants" ENABLE ROW LEVEL SECURITY;
END $$;
