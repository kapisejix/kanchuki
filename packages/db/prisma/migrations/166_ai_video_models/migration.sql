-- 166: F-034 Phase 2 — DB-backed video model table + per-plan model choice.
-- docs/tasks/pending/ai-promo-video.md §5. Replaces the hardcoded VIDEO_MODELS in
-- apps/api/src/lib/fal-video.ts (T4).
-- NOT APPLIED by the agent; the owner applies it after 165 and BEFORE the API that reads it ships.
--
-- Platform-level tables (no retailer_id, nothing on the purge path).
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- SELECT/INSERT/UPDATE to kanchuki_app. DELETE is NOT granted and nothing deletes these rows
-- (RC-049/RC-162): retire a model with enabled = false.
-- RLS: same `backend_roles_full_access` policy as 111/136/144/152, idempotent, skipped with a
-- warning when the backend roles are missing.
--
-- Seed: the live Fal endpoints read on 2026-11-17, all DISABLED. T4 re-verifies each endpoint and
-- price on the admin bench before an admin enables one. Prices are USD per second of output;
-- no rupee figures are stored. No plan_video_models and no plan_limits rows: the feature stays
-- off until the owner chooses a model per plan and sets AI_VIDEO limits.
--
-- Idempotent.
-- Rollback: DROP TABLE IF EXISTS "plan_video_models"; DROP TABLE IF EXISTS "video_models";

CREATE TABLE IF NOT EXISTS "video_models" (
    "model_key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_usd_per_second" DECIMAL(10,4),
    "notes" TEXT,
    "removal_date" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_models_pkey" PRIMARY KEY ("model_key"),
    CONSTRAINT "video_models_price_check" CHECK ("price_usd_per_second" IS NULL OR "price_usd_per_second" >= 0)
);

CREATE TABLE IF NOT EXISTS "plan_video_models" (
    "plan" "SubscriptionPlan" NOT NULL,
    "model_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_video_models_pkey" PRIMARY KEY ("plan"),
    CONSTRAINT "plan_video_models_model_key_fkey" FOREIGN KEY ("model_key")
      REFERENCES "video_models"("model_key") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "video_models" ("model_key", "endpoint", "label", "price_usd_per_second", "notes", "removal_date") VALUES
  ('wan_22_a14b', 'fal-ai/wan/v2.2-a14b/image-to-video', 'Wan 2.2 A14B', 0.0800,
   'fal.ai 2026-11-17: $0.04/0.06/0.08 per s at 480/580/720p; 720p rate stored', DATE '2027-01-04'),
  ('kling_25_turbo_pro', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 'Kling 2.5 Turbo Pro', 0.0700,
   'fal.ai pricing page 2026-11-17', NULL),
  ('kling_26_pro', 'fal-ai/kling-video/v2.6/pro/image-to-video', 'Kling 2.6 Pro', 0.0700,
   'fal.ai pricing page 2026-11-17', NULL),
  ('seedance_1_pro_fast', 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', 'Seedance 1.0 Pro Fast', NULL,
   'Token-priced: $1 per 1M tokens (fal.ai 2026-11-17); tokens per clip not yet measured (T4)', NULL)
ON CONFLICT ("model_key") DO NOTHING;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['video_models', 'plan_video_models'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '166: kanchuki_app/kanchuki_purge missing - skipping backend RLS policy. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['video_models', 'plan_video_models'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t
        AND policyname = policy_name
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
        policy_name,
        t
      );
    END IF;
  END LOOP;
END $$;
