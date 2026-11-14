-- 152: design_templates — admin-made social image designs (background art + variable layers).
-- docs/tasks/pending/admin-social-design-templates.md §4.2.
-- NOT APPLIED by the agent. The owner applies it, and BEFORE any API that selects the table is
-- deployed (a Prisma model whose table the DB lacks fails at query time, RC-160).
--
-- Same catalog shape as post_templates (091): status DRAFT|PUBLISHED|HIDDEN, plans[] where []
-- means nobody, sort_order. Reuses the existing "PostTemplateStatus" and "SubscriptionPlan" enums.
-- Admin-owned and global, so there is no retailer_id and no per-tenant policy.
--
-- `spec` holds { layers: [...] }; the database does not understand it. parseDesignSpec() in
-- @kanchuki/shared validates it before every write and every render.
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- SELECT/INSERT/UPDATE on new tables to kanchuki_app. DELETE is NOT granted and nothing deletes
-- these rows (RC-049): a retired design is set to HIDDEN.
-- RLS: same `backend_roles_full_access` policy as 111/136/144, idempotent, skipped with a
-- warning when the backend roles are missing.
--
-- Idempotent. No seed rows: the admin creates designs from the dashboard.
--
-- Rollback:
--   DROP TABLE IF EXISTS "design_templates";
--   DROP TYPE IF EXISTS "DesignFormat";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DesignFormat') THEN
    CREATE TYPE "DesignFormat" AS ENUM ('SQUARE', 'PORTRAIT_4_5', 'STORY_9_16');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "design_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PostTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "plans" "SubscriptionPlan"[] NOT NULL DEFAULT ARRAY[]::"SubscriptionPlan"[],
    "occasion" TEXT,
    "format" "DesignFormat" NOT NULL DEFAULT 'PORTRAIT_4_5',
    "product_slots" INTEGER NOT NULL DEFAULT 1,
    "spec" JSONB NOT NULL,
    "background_key" TEXT,
    "thumbnail_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "design_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "design_templates_product_slots_check" CHECK ("product_slots" BETWEEN 1 AND 6)
);

CREATE INDEX IF NOT EXISTS "design_templates_status_idx" ON "design_templates"("status");
CREATE INDEX IF NOT EXISTS "design_templates_occasion_idx" ON "design_templates"("occasion");

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  ALTER TABLE "design_templates" ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '152: kanchuki_app/kanchuki_purge missing - skipping backend RLS policy. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'design_templates'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'design_templates'
    );
  END IF;
END $$;
