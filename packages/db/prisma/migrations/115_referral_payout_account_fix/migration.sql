-- 115: align referral_payout_accounts with schema.prisma and the T7 owner
-- decision (docs/tasks/referral-program-retailer-affiliate.md §7 T7).
--
-- (1) Enum drift: 113 created account_type as TEXT with a lowercase CHECK
--     ('bank_account' | 'vpa'), while schema.prisma declares the enum
--     "referral_payout_account_type" (BANK_ACCOUNT | VPA). Prisma casts writes
--     to that type, which did not exist — every payout-account save failed, so
--     no referrer could ever be paid. The table is therefore empty in prod;
--     upper() is only defensive.
-- (2) Raw details: the owner decision is "store ONLY RazorpayX ids + a masked
--     display". 113 kept raw bank/UPI details "for recreation", but nothing
--     reads them — replacement always arrives with fresh details in the PUT
--     body. Dropped.

CREATE TYPE "referral_payout_account_type" AS ENUM ('BANK_ACCOUNT', 'VPA');

ALTER TABLE "referral_payout_accounts" DROP CONSTRAINT "referral_payout_accounts_details_pairing";
ALTER TABLE "referral_payout_accounts" DROP CONSTRAINT "referral_payout_accounts_account_type";
ALTER TABLE "referral_payout_accounts" ALTER COLUMN "account_type" DROP DEFAULT;
ALTER TABLE "referral_payout_accounts"
    ALTER COLUMN "account_type" TYPE "referral_payout_account_type"
    USING upper("account_type")::"referral_payout_account_type";
ALTER TABLE "referral_payout_accounts" ALTER COLUMN "account_type" SET DEFAULT 'BANK_ACCOUNT';

ALTER TABLE "referral_payout_accounts" DROP COLUMN "bank_details";
ALTER TABLE "referral_payout_accounts" DROP COLUMN "vpa_address";
