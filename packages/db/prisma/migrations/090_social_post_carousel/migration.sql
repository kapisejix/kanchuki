-- 090: Create Post Composer v2 — SocialPost additions for carousel / link /
-- media snapshot / idempotency. (docs/tasks/social-create-post-composer.md, T-1.1)
--
-- New columns on social_posts:
--   link_url        — the resolved link that went out (history display)
--   link_type       — none | collection | storefront | product
--   media           — snapshot of [{ product_id, photo_id|video_id, kind, url }]
--                     so history survives later product edits/deletes
--   client_post_id  — client-generated uuid for idempotent retries (R-13)
--
-- SocialPostStatus gains SCHEDULED + DRAFT now (unused until the separate
-- scheduling task) so no second enum migration is needed later. The ADD VALUE
-- statements are their own statements and nothing in this migration USES the
-- new values, so there is no 55P04 risk — the 060–062 split pattern only
-- applies when a new value is referenced in the same transaction.

ALTER TYPE "SocialPostStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "SocialPostStatus" ADD VALUE 'DRAFT';

ALTER TABLE "social_posts"
  ADD COLUMN "link_url" TEXT,
  ADD COLUMN "link_type" TEXT,
  ADD COLUMN "media" JSONB,
  ADD COLUMN "client_post_id" TEXT;

-- Idempotency (R-13): one client_post_id per retailer. Postgres unique treats
-- NULLs as distinct, so legacy rows without an id are unaffected.
CREATE UNIQUE INDEX "social_posts_retailer_id_client_post_id_key"
  ON "social_posts"("retailer_id", "client_post_id");