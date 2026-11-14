-- 155: ai_custom_designs — a retailer's AI-generated social design (T5), one row per generation.
-- docs/tasks/pending/admin-social-design-templates.md §5. Needs 154 applied first.
-- NOT APPLIED by the agent; the owner applies it BEFORE the API that selects the table is
-- deployed (a Prisma model whose table the DB lacks fails at query time, RC-160).
--
-- id IS the BullMQ job id and the quota_reservations.job_id, so the hourly quota sweep can tell a
-- paid result (status READY) from a lost one without a second key.
-- status: PENDING -> READY | FAILED (CHECK, not an enum: three values, no reuse elsewhere).
-- image_key / image_url are set only on READY; `prompt` is the retailer's SANITISED text.
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- SELECT/INSERT/UPDATE on new tables to kanchuki_app. DELETE is NOT granted and nothing deletes
-- these rows (RC-049); the FK cascades only when a retailer/product is hard-deleted by the purge role.
-- RLS: same `backend_roles_full_access` policy as 111/136/144/152, idempotent.
--
-- Rollback:
--   DROP TABLE IF EXISTS "ai_custom_designs";

CREATE TABLE IF NOT EXISTS "ai_custom_designs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "image_key" TEXT,
    "image_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_custom_designs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_custom_designs_status_check" CHECK ("status" IN ('PENDING', 'READY', 'FAILED')),
    CONSTRAINT "ai_custom_designs_retailer_id_fkey" FOREIGN KEY ("retailer_id")
      REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ai_custom_designs_product_id_fkey" FOREIGN KEY ("product_id")
      REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_custom_designs_retailer_id_created_at_idx"
  ON "ai_custom_designs"("retailer_id", "created_at");

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  ALTER TABLE "ai_custom_designs" ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '155: kanchuki_app/kanchuki_purge missing - skipping backend RLS policy. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'ai_custom_designs'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'ai_custom_designs'
    );
  END IF;
END $$;
