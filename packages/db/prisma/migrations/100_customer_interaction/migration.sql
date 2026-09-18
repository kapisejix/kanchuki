-- F-037 Phase 1: behavioral event log (net-new, identity-scoped).
-- customer_interactions was dropped by migration 082 (VTO/Fashion-DNA
-- teardown) — this is a fresh table, not a revival of the old
-- retailer-scoped one. See docs/tasks/customer-engagement-and-admin-behavior-analytics.md §0.

CREATE TYPE "CustomerInteractionType" AS ENUM ('VIEW', 'SEARCH', 'FAVORITE', 'UNFAVORITE', 'ENQUIRY', 'STORE_VISIT');

CREATE TABLE "customer_interactions" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "type" "CustomerInteractionType" NOT NULL,
    "product_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_interactions_customer_account_id_created_at_idx" ON "customer_interactions"("customer_account_id", "created_at");
CREATE INDEX "customer_interactions_retailer_id_type_created_at_idx" ON "customer_interactions"("retailer_id", "type", "created_at");

ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security — identity-scoped, Kanchuki-only (matches
-- customer_recently_viewed / customer_wishlist_items / store_affinities).
-- Retailer-facing aggregate view is Phase 4 — no retailer SELECT policy yet.
ALTER TABLE "customer_interactions" ENABLE ROW LEVEL SECURITY;
