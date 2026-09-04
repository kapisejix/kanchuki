-- 091: Admin-Managed Post Templates (Create Post Composer v2 addendum §11,
-- docs/tasks/social-create-post-composer.md, T-9.1).
--
-- Admin-owned, plan-gated text templates (caption + hashtags + post-type
-- hint) that retailers pick in the Create Post composer and in campaign
-- creation. Follows the studio_styles / background_images admin-catalog
-- pattern:
--   status DRAFT|PUBLISHED|HIDDEN  (DRAFT/HIDDEN invisible to retailers)
--   plans  SubscriptionPlan[]      ([] = nobody; PUBLISHED + plans has
--                                   retailer.plan = visible)
--
-- Distinct from the retailer-scoped social_templates (069, AI image
-- generation) — do NOT retrofit that table. This is schema-only: no seed
-- rows yet (admin creates templates via the dashboard UI), so no 55P04
-- concern (fresh CREATE TYPE + no ADD VALUE).

-- CreateEnum
CREATE TYPE "PostTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
CREATE TYPE "PostTemplateContext" AS ENUM ('POST', 'CAMPAIGN', 'BOTH');

-- CreateTable
CREATE TABLE "post_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "context" "PostTemplateContext" NOT NULL DEFAULT 'POST',
    "post_type" "SocialPostType",
    "caption_template" TEXT NOT NULL,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "occasion" TEXT,
    "thumbnail_url" TEXT,
    "status" "PostTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "plans" "SubscriptionPlan"[] NOT NULL DEFAULT ARRAY[]::"SubscriptionPlan"[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_templates_status_idx" ON "post_templates"("status");
CREATE INDEX "post_templates_occasion_idx" ON "post_templates"("occasion");