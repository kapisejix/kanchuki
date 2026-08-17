-- India Retailer Growth Engine (docs/INDIA-RETAILER-GROWTH.md).
-- One migration for the whole growth suite: lead-source tracking (B),
-- customer referrals (C), festival campaigns (D), promotions (F),
-- reactivation/A-B campaigns (G/S), suppliers (K), showroom bookings (L),
-- product videos (Q), and the GROWTH_ENGINE plan-feature gate.
-- NOTE: khata (H) and udhar (O) were removed from scope 2026-08-17 — no
-- tables for them in this migration.

-- ─── Enums ─────────────────────────────────────────────────────────

CREATE TYPE "CustomerLeadSource" AS ENUM ('MANUAL', 'QR_SCAN', 'STORE_SCAN', 'REFERRAL', 'CAMPAIGN');
CREATE TYPE "CampaignType" AS ENUM ('FESTIVAL', 'REACTIVATION', 'PROMOTION', 'AB_TEST');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');
CREATE TYPE "CampaignSendStatus" AS ENUM ('QUEUED', 'SENT', 'OPENED');
CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "SupplierTransactionKind" AS ENUM ('ORDER', 'PAYMENT');
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "ReferralCreditStatus" AS ENUM ('PENDING', 'CREDITED');

-- ─── Existing-table changes ───────────────────────────────────────
-- NOTE: the GROWTH_ENGINE PlanFeatureKey enum value + the plan_features
-- rows live in migrations 056/057, NOT here. PostgreSQL 55P04: an enum
-- value added via ALTER TYPE ... ADD VALUE cannot be USED in the same
-- transaction that added it, and Prisma runs each migration in one
-- transaction. Splitting keeps them in separate transactions.

-- Lead-origin tracking on customers (roadmap B — QR lead capture).
ALTER TABLE "customers" ADD COLUMN "source" "CustomerLeadSource" NOT NULL DEFAULT 'MANUAL';

-- Customer referral program config (roadmap C).
ALTER TABLE "retailers" ADD COLUMN "referral_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "retailers" ADD COLUMN "referral_reward_paise" INTEGER NOT NULL DEFAULT 0;

-- Indian fit flags on products (roadmap N).
ALTER TABLE "products" ADD COLUMN "is_unstitched" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "includes_blouse" BOOLEAN NOT NULL DEFAULT false;

-- ─── New tables ───────────────────────────────────────────────────

CREATE TABLE "festivals" (
  -- Numeric auto-increment id — admins add/edit/delete rows freely (state/
  -- region-wise offers with start/end dates), so the id is meaningless.
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT 'PAN_INDIA',
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "festivals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "festivals_starts_at_ends_at_idx" ON "festivals"("starts_at", "ends_at");
CREATE INDEX "festivals_region_idx" ON "festivals"("region");

CREATE TABLE "campaigns" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "type" "CampaignType" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "festival_id" INTEGER,
  "festival_name" TEXT,
  "message_template" TEXT NOT NULL,
  "audience_json" JSONB NOT NULL,
  "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ab_variants" JSONB,
  "schedule_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "opened_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaigns_retailer_id_status_idx" ON "campaigns"("retailer_id", "status");
CREATE INDEX "campaigns_retailer_id_type_idx" ON "campaigns"("retailer_id", "type");

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "campaign_sends" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "variant_label" TEXT,
  "status" "CampaignSendStatus" NOT NULL DEFAULT 'QUEUED',
  "sent_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "campaign_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaign_sends_campaign_id_idx" ON "campaign_sends"("campaign_id");
CREATE INDEX "campaign_sends_retailer_id_status_idx" ON "campaign_sends"("retailer_id", "status");

ALTER TABLE "campaign_sends"
  ADD CONSTRAINT "campaign_sends_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_sends"
  ADD CONSTRAINT "campaign_sends_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "promotions" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discount_type" "PromotionDiscountType" NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "min_order_paise" INTEGER,
  "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "times_used" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promotions_retailer_id_code_key" ON "promotions"("retailer_id", "code");
CREATE INDEX "promotions_retailer_id_is_active_idx" ON "promotions"("retailer_id", "is_active");

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "city" TEXT,
  "notes" TEXT,
  "pending_amount_paise" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suppliers_retailer_id_idx" ON "suppliers"("retailer_id");

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_transactions" (
  "id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "kind" "SupplierTransactionKind" NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "note" TEXT,
  "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_transactions_supplier_id_idx" ON "supplier_transactions"("supplier_id");
CREATE INDEX "supplier_transactions_retailer_id_transaction_date_idx" ON "supplier_transactions"("retailer_id", "transaction_date");

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bookings" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bookings_retailer_id_status_idx" ON "bookings"("retailer_id", "status");
CREATE INDEX "bookings_retailer_id_starts_at_idx" ON "bookings"("retailer_id", "starts_at");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "referrals" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "reward_paise" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "signups" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");
CREATE INDEX "referrals_retailer_id_idx" ON "referrals"("retailer_id");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "referral_credits" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "referral_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "status" "ReferralCreditStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "referral_credits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_credits_customer_id_idx" ON "referral_credits"("customer_id");
CREATE INDEX "referral_credits_referral_id_idx" ON "referral_credits"("referral_id");

ALTER TABLE "referral_credits"
  ADD CONSTRAINT "referral_credits_referral_id_fkey"
  FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_credits"
  ADD CONSTRAINT "referral_credits_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_videos" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "r2_key" TEXT NOT NULL,
  "public_url" TEXT NOT NULL,
  "duration_sec" INTEGER,
  "is_main" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_videos_product_id_idx" ON "product_videos"("product_id");

ALTER TABLE "product_videos"
  ADD CONSTRAINT "product_videos_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Festival calendar seed (roadmap D) ────────────────────────────
-- Approximate dates for the 2026-27 season, editable guidance not gospel —
-- admins can add/update rows without a migration (numeric auto ids). Region
-- keys are the same loose tags used in campaign audience targeting.
INSERT INTO "festivals" ("name", "region", "starts_at", "ends_at") VALUES
  ('Pongal',            'TAMIL_NADU',   '2026-01-14T00:00:00Z', '2026-01-17T23:59:59Z'),
  ('Gudi Padwa',        'MAHARASHTRA',  '2026-03-19T00:00:00Z', '2026-03-19T23:59:59Z'),
  ('Eid al-Fitr',       'PAN_INDIA',    '2026-03-20T00:00:00Z', '2026-03-22T23:59:59Z'),
  ('Baisakhi',          'PUNJAB',       '2026-04-13T00:00:00Z', '2026-04-14T23:59:59Z'),
  ('Raksha Bandhan',    'PAN_INDIA',    '2026-08-28T00:00:00Z', '2026-08-28T23:59:59Z'),
  ('Onam',              'KERALA',       '2026-08-25T00:00:00Z', '2026-09-04T23:59:59Z'),
  ('Navratri',          'PAN_INDIA',    '2026-10-11T00:00:00Z', '2026-10-20T23:59:59Z'),
  ('Durga Puja',        'BENGAL',       '2026-10-16T00:00:00Z', '2026-10-21T23:59:59Z'),
  ('Karwa Chauth',      'PAN_INDIA',    '2026-10-30T00:00:00Z', '2026-10-30T23:59:59Z'),
  ('Diwali',            'PAN_INDIA',    '2026-11-08T00:00:00Z', '2026-11-12T23:59:59Z'),
  ('Wedding Season',    'PAN_INDIA',    '2026-11-15T00:00:00Z', '2027-02-15T23:59:59Z'),
  ('Christmas Party',   'PAN_INDIA',    '2026-12-15T00:00:00Z', '2026-12-31T23:59:59Z');
