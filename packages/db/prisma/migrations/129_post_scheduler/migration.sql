-- 129_post_scheduler
--
-- F-043 Social Post Scheduler — tables, RLS, seed rows. Requires 128 (enum values).
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- kanchuki_app SELECT/INSERT/UPDATE on new tables. DELETE is NOT granted except on
-- scheduled_post_items (slide "Remove" is a hard delete of a join row; no deleted_at,
-- not a SECURITY §19 business model — the migration-125 "Option A" reasoning).
-- Plans and posts are never hard-deleted: they move to ENDED / SKIPPED.
--
-- RLS: same two-part shape as 111/126 — policy for the two backend roles first, then
-- ENABLE, so there is never a window where RLS is on and the API sees 0 rows (RC-030).
-- Retailer scoping is enforced in apps/api (every query carries retailer_id), like every
-- other retailer table; RLS here denies anon/authenticated (PostgREST) access.

-- ── enums ────────────────────────────────────────────────────────
CREATE TYPE "SchedulePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE "ScheduledPostStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHING', 'POSTED', 'FAILED', 'MISSED', 'SKIPPED');
CREATE TYPE "ScheduleImageLevel" AS ENUM ('ORIGINAL', 'TEMPLATE');

-- ── post_schedule_plans ──────────────────────────────────────────
CREATE TABLE "post_schedule_plans" (
  "id"                TEXT NOT NULL,
  "retailer_id"       TEXT NOT NULL,
  "social_account_id" TEXT NOT NULL,
  "platform"          "SocialPlatform" NOT NULL,
  "post_type"         "SocialPostType" NOT NULL DEFAULT 'CAROUSEL',
  "weekdays"          INTEGER[] NOT NULL,                 -- 0=Sun … 6=Sat, evaluated in IST
  "post_time"         TEXT NOT NULL,                      -- 'HH:mm' IST
  "batch_ranges"      JSONB NOT NULL,                     -- { "1": [4,5], "2": [7,8] }
  "source"            TEXT NOT NULL DEFAULT 'NEWEST',     -- NEWEST | CATEGORY | MANUAL
  "source_category"   TEXT,
  "source_product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cover_style"       TEXT,                               -- Task 4
  "rotation_pool"     JSONB NOT NULL DEFAULT '[]',        -- Task 4
  "horizon_days"      INTEGER NOT NULL,
  "starts_on"         TEXT NOT NULL,                      -- 'YYYY-MM-DD' IST
  "status"            "SchedulePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "pause_reason"      TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_schedule_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_schedule_plans_horizon_chk" CHECK ("horizon_days" BETWEEN 1 AND 31),
  CONSTRAINT "post_schedule_plans_time_chk" CHECK ("post_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX "post_schedule_plans_retailer_id_status_idx" ON "post_schedule_plans"("retailer_id", "status");
ALTER TABLE "post_schedule_plans"
  ADD CONSTRAINT "post_schedule_plans_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "post_schedule_plans_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── scheduled_posts ──────────────────────────────────────────────
CREATE TABLE "scheduled_posts" (
  "id"              TEXT NOT NULL,
  "plan_id"         TEXT NOT NULL,
  "retailer_id"     TEXT NOT NULL,
  "scheduled_at"    TIMESTAMP(3) NOT NULL,                -- UTC
  "caption"         TEXT NOT NULL,
  "status"          "ScheduledPostStatus" NOT NULL DEFAULT 'DRAFT',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "error"           TEXT,                                 -- plain-language reason (Task 2 maps it)
  "client_post_id"  TEXT NOT NULL,                        -- fed to the composer fan-out for idempotency
  "social_post_id"  TEXT,                                 -- link to social_posts on success
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scheduled_posts_caption_len_chk" CHECK (char_length("caption") <= 2200)
);
CREATE UNIQUE INDEX "scheduled_posts_retailer_id_client_post_id_key" ON "scheduled_posts"("retailer_id", "client_post_id");
-- the publish tick's scan (Task 2): due, READY, oldest first
CREATE INDEX "scheduled_posts_status_scheduled_at_idx" ON "scheduled_posts"("status", "scheduled_at");
CREATE INDEX "scheduled_posts_plan_id_idx" ON "scheduled_posts"("plan_id");
ALTER TABLE "scheduled_posts"
  ADD CONSTRAINT "scheduled_posts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "post_schedule_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scheduled_posts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── scheduled_post_items ─────────────────────────────────────────
CREATE TABLE "scheduled_post_items" (
  "id"                 TEXT NOT NULL,
  "scheduled_post_id"  TEXT NOT NULL,
  "retailer_id"        TEXT NOT NULL,
  "product_id"         TEXT NOT NULL,
  "position"           INTEGER NOT NULL,
  "image_level"        "ScheduleImageLevel" NOT NULL DEFAULT 'ORIGINAL',
  "photo_id"           TEXT,                              -- product_photos.id (level A); no FK — validated in app, snapshot semantics
  "template_id"        TEXT,                              -- Task 4
  "resolved_image_key" TEXT,                              -- Task 4 (level B render output)
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_post_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scheduled_post_items_position_chk" CHECK ("position" BETWEEN 0 AND 9)
);
CREATE UNIQUE INDEX "scheduled_post_items_post_position_key" ON "scheduled_post_items"("scheduled_post_id", "position");
CREATE INDEX "scheduled_post_items_product_id_idx" ON "scheduled_post_items"("product_id");
ALTER TABLE "scheduled_post_items"
  ADD CONSTRAINT "scheduled_post_items_scheduled_post_id_fkey" FOREIGN KEY ("scheduled_post_id") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scheduled_post_items_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scheduled_post_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS + DELETE grant ───────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '129: kanchuki_app/kanchuki_purge missing — RLS/GRANT skipped. Run scripts/setup-role-separation.sql, then re-run this block (enabling RLS without the policy would make the API see 0 rows).';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['post_schedule_plans', 'scheduled_posts', 'scheduled_post_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t AND policyname = 'backend_roles_full_access'
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
        'backend_roles_full_access', t
      );
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  GRANT DELETE ON TABLE "scheduled_post_items" TO kanchuki_app;
END $$;

-- ── seed (D9: all plans equal at launch; owner tightens per plan in Admin) ──
-- SOCIAL_SCHEDULER fails CLOSED, so without these rows the feature is OFF everywhere.
INSERT INTO "plan_features" ("id", "plan", "feature_key", "enabled", "updated_at")
VALUES
  ('pf_sched_starter', 'STARTER', 'SOCIAL_SCHEDULER', true, CURRENT_TIMESTAMP),
  ('pf_sched_growth',  'GROWTH',  'SOCIAL_SCHEDULER', true, CURRENT_TIMESTAMP),
  ('pf_sched_pro',     'PRO',     'SOCIAL_SCHEDULER', true, CURRENT_TIMESTAMP)
ON CONFLICT ("plan", "feature_key") DO NOTHING;

INSERT INTO "plan_limits" ("id", "plan", "resource_type", "limit_per_period", "period", "created_at", "updated_at")
VALUES
  ('plt_schedpost_starter', 'STARTER', 'SCHEDULED_POST',       -1, 'MONTH',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_schedpost_growth',  'GROWTH',  'SCHEDULED_POST',       -1, 'MONTH',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_schedpost_pro',     'PRO',     'SCHEDULED_POST',       -1, 'MONTH',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_schedplan_starter', 'STARTER', 'ACTIVE_SCHEDULE_PLAN',  1, 'LIFETIME', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_schedplan_growth',  'GROWTH',  'ACTIVE_SCHEDULE_PLAN',  1, 'LIFETIME', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_schedplan_pro',     'PRO',     'ACTIVE_SCHEDULE_PLAN',  1, 'LIFETIME', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("plan", "resource_type") DO NOTHING;
