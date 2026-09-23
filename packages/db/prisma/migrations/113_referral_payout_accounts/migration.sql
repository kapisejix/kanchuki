-- 113_referral_payout_accounts
-- T7 of docs/tasks/referral-program-retailer-affiliate.md — retailer payout
-- destination. Owner decision 2026-09-23: retailers add their own Bank/UPI
-- details (self-serve), so payouts have somewhere real to go. The entry UI is
-- T8 (mobile, blocked on Play review) / T9 (admin fallback); this migration +
-- the API endpoints ship first so nothing downstream is blocked on UI.
--
-- WHAT IS STORED — RazorpayX identifiers + a masked display, NOT raw secrets.
-- A payout needs a fund_account_id; a fund account needs a contact_id; both
-- are created in RazorpayX at save time. Raw account numbers / VPAs are kept
-- ONLY so a deactivated fund account can be recreated (RazorpayX has no
-- fund-account update API — deactivate + recreate is the documented path).
-- A row without raw details can still RECEIVE payouts; it just cannot be
-- recreated if the account is deactivated. Masked display is what every UI
-- shows; nothing renders the raw values back except the owner's own PUT flow.
--
-- ONE row per retailer (UNIQUE retailer_id) — T7 pays exactly one destination
-- per referrer. Replacing the account overwrites the row in place; the old
-- RazorpayX fund account is deactivated via PATCH /v1/fund_accounts/:id
-- (active=false) so it can never receive again.
--
-- Retailer CHILD (ON DELETE RESTRICT, same owner decision as 109): the purge
-- sweep deletes this before the retailer row — the sweep job is updated in the
-- same commit (RC-029/RC-030 discipline), and kanchuki_purge gets DELETE.

-- CreateTable
CREATE TABLE "referral_payout_accounts" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    -- RazorpayX identifiers. contact_id is required (fund accounts hang off
    -- contacts); fund_account_id is nullable only for the pre-verification
    -- state where the contact exists but fund-account creation failed.
    "razorpayx_contact_id" TEXT NOT NULL,
    "razorpayx_fund_account_id" TEXT,
    -- Which fund-account flavor this row holds. Enum-like with a CHECK, not a
    -- free string — an unrecognized value must be unrepresentable (RC-027).
    "account_type" TEXT NOT NULL DEFAULT 'bank_account',
    "masked_display" TEXT NOT NULL DEFAULT '',
    -- Raw details, stored ONLY for fund-account recreation. Bank:
    -- { name, ifsc, account_number }. VPA: { address }. Both keyed by
    -- account_type — the CHECK below pins the pairing.
    "bank_details" JSONB,
    "vpa_address" TEXT,
    -- RazorpayX contact metadata (kept so recreation reuses the same contact).
    "contact_name" TEXT NOT NULL DEFAULT '',
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_payout_accounts_pkey" PRIMARY KEY ("id"),

    -- account_type must be one of the two fund-account flavors the code
    -- understands. Anything else fails loudly (RC-027: no silent fall-through).
    CONSTRAINT "referral_payout_accounts_account_type"
        CHECK ("account_type" IN ('bank_account', 'vpa')),
    -- Pairing: a bank_account row carries bank_details and no vpa; a vpa row
    -- carries vpa_address and no bank_details. An impossible pairing would
    -- make recreation send the wrong payload to RazorpayX.
    CONSTRAINT "referral_payout_accounts_details_pairing" CHECK (
        ("account_type" = 'bank_account' AND "bank_details" IS NOT NULL AND "vpa_address" IS NULL)
        OR ("account_type" = 'vpa' AND "vpa_address" IS NOT NULL AND "bank_details" IS NULL)
    ),
    -- An ACTIVE row must have a fund account to pay into — the whole point.
    -- An INACTIVE row may have lost it (deactivated on replace).
    CONSTRAINT "referral_payout_accounts_active_needs_fund_account" CHECK (
        "is_active" = false OR "razorpayx_fund_account_id" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_payout_accounts_retailer_id_key" ON "referral_payout_accounts"("retailer_id");
-- RazorpayX rejects duplicate fund accounts for the same contact, and a unique
-- index here makes the "replace account" flow a simple upsert.
CREATE UNIQUE INDEX "referral_payout_accounts_razorpayx_fund_account_id_key" ON "referral_payout_accounts"("razorpayx_fund_account_id");

-- ─── Foreign keys ────────────────────────────────────────────────
ALTER TABLE "referral_payout_accounts" ADD CONSTRAINT "referral_payout_accounts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Purge-role DELETE grant (SECURITY §19) ─────────────────────
-- kanchuki_app has DELETE revoked platform-wide; this table is a retailer
-- CHILD with a RESTRICT FK, so the sweep needs DELETE on kanchuki_purge.
GRANT DELETE ON TABLE referral_payout_accounts TO kanchuki_purge;
