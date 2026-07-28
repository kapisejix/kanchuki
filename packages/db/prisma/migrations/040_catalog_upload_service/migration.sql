-- F-019: Paid On-Site Catalog Upload Service
-- Extends support_tickets with fields used only when ticket_type = CATALOG_UPLOAD,
-- plus an admin-editable price tier table (same live-edit pattern as
-- plan_limits/plan_features — no deploy needed to change a price break).

CREATE TYPE "TicketType" AS ENUM ('GENERAL', 'CATALOG_UPLOAD');

ALTER TABLE support_tickets
  ADD COLUMN ticket_type            "TicketType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN item_count_requested   INTEGER,
  ADD COLUMN quoted_price_inr       INTEGER,
  ADD COLUMN proposed_slots         JSONB,
  ADD COLUMN confirmed_slot         TIMESTAMPTZ,
  ADD COLUMN razorpay_order_id      TEXT,
  ADD COLUMN paid_at                TIMESTAMPTZ;

CREATE INDEX idx_support_tickets_ticket_type ON support_tickets (ticket_type);

CREATE TABLE "catalog_upload_price_tiers" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "min_items"     INTEGER NOT NULL,
  "max_items"     INTEGER,
  "price_inr"     INTEGER NOT NULL,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" TEXT,

  CONSTRAINT "catalog_upload_price_tiers_pkey" PRIMARY KEY ("id")
);

-- Starter default tiers — admin can edit/replace freely from the admin UI
INSERT INTO "catalog_upload_price_tiers" ("min_items", "max_items", "price_inr") VALUES
  (1, 100, 1499),
  (101, 500, 4999),
  (501, 1500, 9999),
  (1501, NULL, 14999);

-- RLS: same deny-all-except-admin pattern as plan_limits and plan_features
ALTER TABLE "catalog_upload_price_tiers" ENABLE ROW LEVEL SECURITY;
-- No policies defined = default deny for authenticated/anon roles
