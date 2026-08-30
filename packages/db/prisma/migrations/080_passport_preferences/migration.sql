-- Migration 080: Passport preferences on CustomerAccount + CustomerFashionDNA customer_account_id index
-- Task 15: Generalize FashionDNA to support passport-scoped (cross-store) DNA

-- Add preference fields to customer_accounts
ALTER TABLE "customer_accounts" ADD COLUMN "pref_colors" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "customer_accounts" ADD COLUMN "pref_styles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "customer_accounts" ADD COLUMN "pref_fabrics" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "customer_accounts" ADD COLUMN "pref_occasions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "customer_accounts" ADD COLUMN "budget_min" INTEGER;
ALTER TABLE "customer_accounts" ADD COLUMN "budget_max" INTEGER;
ALTER TABLE "customer_accounts" ADD COLUMN "notes" TEXT;

-- Add index for passport-scoped FashionDNA lookup
CREATE INDEX IF NOT EXISTS "customer_fashion_dna_customer_account_id_idx" ON "customer_fashion_dna"("customer_account_id");
