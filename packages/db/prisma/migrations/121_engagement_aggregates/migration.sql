-- 121_engagement_aggregates
--
-- F-037 Phase 2 (docs/tasks/pending/customer-engagement-analytics.md §6):
-- two rollup tables the nightly aggregation job writes and the admin/retailer
-- dashboards (Phase 3/4) will read. Never query customer_interactions
-- directly for a dashboard chart.
--
-- RLS: none, following 119's post-Railway-move convention (see its header) —
-- ALTER DEFAULT PRIVILEGES already grants kanchuki_app SELECT/INSERT/UPDATE
-- on new tables.
--
-- Purge: none needed either. Both tables carry a REAL retailer_id FK with
-- ON DELETE CASCADE, so a retailer purge removes these rows through the
-- constraint — the RC-030 bare-retailer_id trap (customer_interactions'
-- own shape) does not apply here because these are new tables, not a revival
-- of an old one.

CREATE TABLE "retailer_engagement_daily" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "total_dwell_ms" BIGINT NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "search_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "unfavorite_count" INTEGER NOT NULL DEFAULT 0,
    "enquiry_count" INTEGER NOT NULL DEFAULT 0,
    "zero_result_count" INTEGER NOT NULL DEFAULT 0,
    "top_products" JSONB NOT NULL DEFAULT '[]',
    "top_searches" JSONB NOT NULL DEFAULT '[]',
    "zero_result_terms" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_engagement_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_engagement_summaries" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "total_dwell_ms" BIGINT NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "enquiry_count" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_engagement_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retailer_engagement_daily_retailer_id_date_key" ON "retailer_engagement_daily"("retailer_id", "date");
CREATE INDEX "retailer_engagement_daily_retailer_id_date_idx" ON "retailer_engagement_daily"("retailer_id", "date");

CREATE UNIQUE INDEX "customer_engagement_summaries_customer_account_id_retailer_id_key" ON "customer_engagement_summaries"("customer_account_id", "retailer_id");
CREATE INDEX "customer_engagement_summaries_retailer_id_last_active_at_idx" ON "customer_engagement_summaries"("retailer_id", "last_active_at");

ALTER TABLE "retailer_engagement_daily" ADD CONSTRAINT "retailer_engagement_daily_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_engagement_summaries" ADD CONSTRAINT "customer_engagement_summaries_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_engagement_summaries" ADD CONSTRAINT "customer_engagement_summaries_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
