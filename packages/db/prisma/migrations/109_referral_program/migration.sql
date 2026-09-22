-- 109_referral_program
-- T1 of docs/tasks/referral-program-retailer-affiliate.md — retailer → retailer
-- affiliate program. SCHEMA ONLY: this migration ships no routes, no logic and
-- no notification of any kind (T2 onward are separate tasks).
--
-- NOT the customer-facing "Referral Program Engine" removed by migration 082
-- (tables referrals / referral_credits / partner_referrals, enums
-- ReferralCreditStatus / PartnerReferralStatus, retailers.referral_enabled and
-- retailers.referral_reward_paise). None of those identifiers are reused here,
-- so a grep for the removed feature finds nothing in this migration
-- (spec §11 — RC-007 / RC-012 / RC-013).
--
-- NOR F-018's internal-team referral codes (TeamMember.referral_code →
-- retailers.onboarded_by_id). That one attributes a signup to a Kanchuki
-- salesperson; this one pays a retailer for bringing in a peer. Two separate
-- ledgers, deliberately.
--
-- NO HARDCODED TERMS: every economic value lives in referral_settings and is
-- read at call time. The INSERT at the bottom seeds the single singleton row
-- with the owner-locked defaults (2026-09-22) so consuming code never needs a
-- fallback constant — with the row always present, "30%" and "12 months" have
-- exactly one home and it is not the codebase.
--
-- Every config/state column carries a DB CHECK. An enum-like or cross-field
-- value the code does not understand must fail loudly rather than silently
-- no-op — that is the RC-027 lesson (a free-text `engine` column that nothing
-- validated, pointing at a pipeline that never received the product photo).
--
-- Deliberately NO RLS: the zero-policy deny-all pattern breaks the pooled
-- Prisma read path, so tables added since the Railway move rely on app-layer
-- tenant scoping through the privileged app role (see migration 099's header
-- and migration 093 for the same call).

-- ─── Enums ──────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ReferralBonusType" AS ENUM ('FREE_MONTH', 'FLAT_DISCOUNT', 'NONE');

-- CreateEnum
CREATE TYPE "ReferralPayoutCadence" AS ENUM ('MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReferralConversionStatus" AS ENUM ('PENDING', 'QUALIFIED', 'PAID', 'CLAWED_BACK');

-- CreateEnum
CREATE TYPE "ReferralPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');

-- ─── referral_settings — singleton, admin-editable ──────────────
-- One row, id = 'singleton' (same shape as platform_gst_profile, migration
-- 088). Admin edits it in place from /admin/referral-settings (T2).

-- CreateTable
CREATE TABLE "referral_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "commission_pct" INTEGER NOT NULL DEFAULT 30,
    "duration_months" INTEGER NOT NULL DEFAULT 12,
    "qualify_days" INTEGER NOT NULL DEFAULT 30,
    "referred_bonus_type" "ReferralBonusType" NOT NULL DEFAULT 'FREE_MONTH',
    "referred_bonus_value" INTEGER NOT NULL DEFAULT 1,
    "second_tier_enabled" BOOLEAN NOT NULL DEFAULT false,
    "second_tier_pct" INTEGER,
    "payout_min_amount" INTEGER NOT NULL DEFAULT 50000,
    "payout_cadence" "ReferralPayoutCadence" NOT NULL DEFAULT 'MONTHLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_settings_pkey" PRIMARY KEY ("id"),

    -- Ranges. T2's zod validates these too, but an impossible commission
    -- (150%) or a negative payout floor must be unrepresentable in the DB, not
    -- merely rejected by one route.
    CONSTRAINT "referral_settings_commission_pct_range"
        CHECK ("commission_pct" BETWEEN 0 AND 100),
    CONSTRAINT "referral_settings_duration_months_positive"
        CHECK ("duration_months" >= 1),
    CONSTRAINT "referral_settings_qualify_days_non_negative"
        CHECK ("qualify_days" >= 0),
    CONSTRAINT "referral_settings_payout_min_amount_non_negative"
        CHECK ("payout_min_amount" >= 0),
    CONSTRAINT "referral_settings_second_tier_pct_range"
        CHECK ("second_tier_pct" IS NULL OR "second_tier_pct" BETWEEN 0 AND 100),
    -- second_tier_enabled = true with no percentage is an impossible state.
    CONSTRAINT "referral_settings_second_tier_pct_required"
        CHECK ("second_tier_enabled" = false OR "second_tier_pct" IS NOT NULL),
    -- referred_bonus_value's UNIT depends on referred_bonus_type: months for
    -- FREE_MONTH, paise for FLAT_DISCOUNT, and exactly 0 for NONE. Tying the
    -- pair together in the DB is what stops this value from silently meaning
    -- something other than what the code assumes (RC-027).
    CONSTRAINT "referral_settings_referred_bonus_pairing" CHECK (
        ("referred_bonus_type" = 'NONE' AND "referred_bonus_value" = 0)
        OR ("referred_bonus_type" <> 'NONE' AND "referred_bonus_value" > 0)
    )
);

-- Seed the singleton row. Consuming code reads it at call time; because the
-- row always exists, no hardcoded fallback constant is needed anywhere.
-- Every value below takes the column DEFAULT, which is the owner-locked term.
-- ON CONFLICT keeps this re-runnable if the admin migration runner retries.
INSERT INTO "referral_settings" ("id", "updated_at")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ─── referral_codes — one shareable code per retailer ──────────

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_retailer_id_key" ON "referral_codes"("retailer_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- ─── referral_conversions — one row per referred retailer ───────

-- CreateTable
CREATE TABLE "referral_conversions" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_id" TEXT NOT NULL,
    "status" "ReferralConversionStatus" NOT NULL DEFAULT 'PENDING',
    "qualifies_at" TIMESTAMP(3),
    "qualified_at" TIMESTAMP(3),
    "clawed_back_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "commission_base_amount" INTEGER NOT NULL DEFAULT 0,
    "commission_accrued" INTEGER NOT NULL DEFAULT 0,
    "payout_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_conversions_pkey" PRIMARY KEY ("id"),

    -- Money is paise and can never be negative.
    CONSTRAINT "referral_conversions_commission_non_negative"
        CHECK ("commission_base_amount" >= 0 AND "commission_accrued" >= 0),
    -- A retailer cannot refer itself. T4 also blocks self-referral on identity
    -- (same GSTIN / phone / bank account as the referrer); this is the cheap
    -- structural half of that guard, and it holds whatever a route does.
    CONSTRAINT "referral_conversions_no_self_referral"
        CHECK ("referrer_id" <> "referred_id"),
    -- status and its transition timestamps must agree. This is what makes the
    -- ledger auditable: a row can never claim PAID with no paid_at, and never
    -- be CLAWED_BACK without a clawback (a clawback AFTER payout is legal —
    -- that branch only requires clawed_back_at, so paid_at may remain set).
    CONSTRAINT "referral_conversions_status_timestamps" CHECK (
        ("status" = 'PENDING'
             AND "qualified_at" IS NULL AND "paid_at" IS NULL AND "clawed_back_at" IS NULL)
        OR ("status" = 'QUALIFIED'
             AND "qualified_at" IS NOT NULL AND "paid_at" IS NULL AND "clawed_back_at" IS NULL)
        OR ("status" = 'PAID'
             AND "qualified_at" IS NOT NULL AND "paid_at" IS NOT NULL AND "clawed_back_at" IS NULL)
        OR ("status" = 'CLAWED_BACK'
             AND "clawed_back_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_conversions_referred_id_key" ON "referral_conversions"("referred_id");

-- CreateIndex
CREATE INDEX "referral_conversions_referrer_id_status_idx" ON "referral_conversions"("referrer_id", "status");

-- CreateIndex
CREATE INDEX "referral_conversions_status_qualifies_at_idx" ON "referral_conversions"("status", "qualifies_at");

-- CreateIndex
CREATE INDEX "referral_conversions_payout_id_idx" ON "referral_conversions"("payout_id");

-- ─── referral_payouts — monthly batch per referrer ──────────────

-- CreateTable
CREATE TABLE "referral_payouts" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "ReferralPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayx_payout_id" TEXT,
    "webhook_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "webhook_confirmed_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_payouts_pkey" PRIMARY KEY ("id"),

    -- A batch below payout_min_amount is never raised, so zero or negative is
    -- not a representable batch.
    CONSTRAINT "referral_payouts_amount_positive" CHECK ("amount_paise" > 0),
    -- The webhook flag and its timestamp must agree — this is the only
    -- evidence money actually moved, so it must not be able to lie.
    CONSTRAINT "referral_payouts_webhook_confirmed_at" CHECK (
        ("webhook_confirmed" = false AND "webhook_confirmed_at" IS NULL)
        OR ("webhook_confirmed" = true AND "webhook_confirmed_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_payouts_razorpayx_payout_id_key" ON "referral_payouts"("razorpayx_payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_payouts_idempotency_key_key" ON "referral_payouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "referral_payouts_referrer_id_status_idx" ON "referral_payouts"("referrer_id", "status");

-- CreateIndex
CREATE INDEX "referral_payouts_status_created_at_idx" ON "referral_payouts"("status", "created_at");

-- ─── Foreign keys ───────────────────────────────────────────────
-- All retailer FKs are ON DELETE RESTRICT (owner decision 2026-09-22 — keep
-- the commission ledger rather than cascade it away). That makes every one of
-- these tables a retailer CHILD, so the purge sweep must delete them BEFORE
-- the retailer row, and the scoped kanchuki_purge role needs DELETE on them
-- (grant below). This is precisely the shape that bit this repo twice already:
-- product_attributes and social_accounts shipped with RESTRICT FKs
-- (migrations 046/052), were missing from the purge list, and made
-- `DELETE FROM retailers` throw an FK violation — silently rolling the whole
-- hard-delete back. The jobs are updated in the same commit as this migration.

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull, not Restrict: a payout batch must never be able to block the purge
-- sweep, and a clawback after payout must not have to unpick the batch.
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "referral_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Purge-role DELETE grants (SECURITY §19) ────────────────────
-- kanchuki_app has DELETE revoked platform-wide, so nothing here can be
-- hard-deleted by application code — deliberately. These three tables still
-- need DELETE on the narrowly-scoped kanchuki_purge role, because their
-- RESTRICT FKs to retailers make them retailer children: both the 15-day sweep
-- (apps/api/src/jobs/purge-soft-deleted.ts) and the targeted hard-delete
-- (apps/api/src/jobs/purge-retailer-now.ts) remove them before the retailer
-- row. Same shape and reasoning as migration 084.
--
-- referral_settings is absent on purpose: it is a global singleton, not a
-- retailer child, and is never deleted (admin edits it in place).
GRANT DELETE ON TABLE
  referral_codes,
  referral_conversions,
  referral_payouts
TO kanchuki_purge;
