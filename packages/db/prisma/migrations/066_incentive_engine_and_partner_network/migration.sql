-- CreateEnum
CREATE TYPE "IncentiveTriggerType" AS ENUM ('FIRST_VISIT', 'BIRTHDAY', 'ANNIVERSARY', 'LOYALTY_TIER');

-- CreateEnum
CREATE TYPE "IncentiveDiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('SALON', 'TAILOR', 'STYLIST', 'MAKEUP_ARTIST', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE_OF_SALE');

-- CreateEnum
CREATE TYPE "PartnerReferralStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable: customer_visits
CREATE TABLE "customer_visits" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "visit_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable: incentive_rules
CREATE TABLE "incentive_rules" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" "IncentiveTriggerType" NOT NULL,
    "discount_type" "IncentiveDiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "conditions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incentive_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: partners
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "referral_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "commission_rate" INTEGER NOT NULL,
    "commission_type" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE_OF_SALE',
    "fixed_commission_paise" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable: partner_referrals
CREATE TABLE "partner_referrals" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "commission_paise" INTEGER NOT NULL,
    "status" "PartnerReferralStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: partner_events
CREATE TABLE "partner_events" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "location" TEXT,
    "is_virtual" BOOLEAN NOT NULL DEFAULT false,
    "discount_code" TEXT,
    "discount_paise" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: customer_visits
CREATE INDEX "customer_visits_retailer_id_idx" ON "customer_visits"("retailer_id");

CREATE INDEX "customer_visits_customer_id_idx" ON "customer_visits"("customer_id");

-- CreateIndex: incentive_rules
CREATE INDEX "incentive_rules_retailer_id_idx" ON "incentive_rules"("retailer_id");

-- CreateIndex: partners
CREATE INDEX "partners_retailer_id_idx" ON "partners"("retailer_id");

CREATE UNIQUE INDEX "partners_referral_code_key" ON "partners"("referral_code");

-- CreateIndex: partner_referrals
CREATE INDEX "partner_referrals_partner_id_idx" ON "partner_referrals"("partner_id");

CREATE INDEX "partner_referrals_customer_id_idx" ON "partner_referrals"("customer_id");

CREATE INDEX "partner_referrals_status_idx" ON "partner_referrals"("status");

-- CreateIndex: partner_events
CREATE INDEX "partner_events_retailer_id_idx" ON "partner_events"("retailer_id");

CREATE INDEX "partner_events_partner_id_idx" ON "partner_events"("partner_id");

CREATE INDEX "partner_events_starts_at_idx" ON "partner_events"("starts_at");

-- AddForeignKey: customer_visits
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: incentive_rules
ALTER TABLE "incentive_rules" ADD CONSTRAINT "incentive_rules_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: partners
ALTER TABLE "partners" ADD CONSTRAINT "partners_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: partner_referrals
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: partner_events
ALTER TABLE "partner_events" ADD CONSTRAINT "partner_events_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner_events" ADD CONSTRAINT "partner_events_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
