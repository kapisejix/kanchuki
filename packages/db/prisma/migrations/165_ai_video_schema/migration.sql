-- 165: F-034 Phase 2 (AI promo video + Instagram Reels) — enum values + columns only.
-- docs/tasks/pending/ai-promo-video.md §5.
-- NOT APPLIED by the agent; the owner applies it BEFORE any API that reads these is deployed (RC-160).
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED in the same
-- transaction that added it. Nothing below uses the new values; the tables live in 166.
--
--   PlanFeatureKey.AI_PROMO_VIDEO  fails CLOSED: no plan_features row = OFF for every plan.
--   QuotaResourceType.AI_VIDEO     METERED in lib/quota.ts: no plan_limits row = limit 0.
--   ProductVideoSource.AI_GEN      AI promo clip; Instagram publish sends is_ai_generated=true.
--   SocialPostStatus.PROCESSING    T2b: Reel container still processing on Instagram.
--
-- studio_styles: a VIDEO style keeps its motion prompt in the existing `prompt` column.
-- `no_person` is the D11 kids rule: kids products may only use VIDEO styles with no_person = true.
-- product_videos: `source = 'AI_GEN'` is the AI flag; style_slug/model_key are provenance only.
--
-- OWNER STEP before turning it on: Admin -> Plan Limits (AI_VIDEO per plan) and
-- Admin -> Plan Features (AI_PROMO_VIDEO), only after the acceptance test (spec §10).
--
-- Idempotent.
-- Rollback: enum values cannot be dropped (inert without use). Columns:
--   ALTER TABLE "studio_styles" DROP CONSTRAINT IF EXISTS "studio_styles_kind_check",
--     DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "default_aspect",
--     DROP COLUMN IF EXISTS "duration_sec", DROP COLUMN IF EXISTS "no_person";
--   DROP INDEX IF EXISTS "studio_styles_kind_status_idx";
--   ALTER TABLE "product_videos" DROP COLUMN IF EXISTS "style_slug", DROP COLUMN IF EXISTS "model_key";

ALTER TYPE "ProductVideoSource" ADD VALUE IF NOT EXISTS 'AI_GEN';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'AI_VIDEO';
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'AI_PROMO_VIDEO';
ALTER TYPE "SocialPostStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "studio_styles"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN IF NOT EXISTS "default_aspect" TEXT,
  ADD COLUMN IF NOT EXISTS "duration_sec" INTEGER,
  ADD COLUMN IF NOT EXISTS "no_person" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_styles_kind_check') THEN
    ALTER TABLE "studio_styles" ADD CONSTRAINT "studio_styles_kind_check"
      CHECK (
        "kind" IN ('IMAGE', 'VIDEO')
        AND ("default_aspect" IS NULL OR "default_aspect" IN ('9:16', '4:5', '1:1'))
        AND ("duration_sec" IS NULL OR "duration_sec" BETWEEN 1 AND 8)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "studio_styles_kind_status_idx" ON "studio_styles"("kind", "status");

ALTER TABLE "product_videos"
  ADD COLUMN IF NOT EXISTS "style_slug" TEXT,
  ADD COLUMN IF NOT EXISTS "model_key" TEXT;
