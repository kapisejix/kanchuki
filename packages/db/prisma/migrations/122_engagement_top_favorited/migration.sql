-- 122_engagement_top_favorited
--
-- Closes a Phase 2 gap: docs/tasks/pending/customer-engagement-analytics.md
-- §3.3 asks for "top-viewed / top-favorited products" — Phase 2 (migration 121)
-- only shipped top-viewed. Phase 3's dashboard needs both.

ALTER TABLE "retailer_engagement_daily" ADD COLUMN "top_favorited_products" JSONB NOT NULL DEFAULT '[]';
