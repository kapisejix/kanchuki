-- 163: GST invoice columns on quota_addon_purchases (add-on / try-on top-up packs).
-- NOT APPLIED by the agent; the owner applies it, BEFORE the API deploy that reads
-- these columns (RC-160: code reading a new column ahead of its migration 500s
-- every whole-row query on the table).
--
-- Pack sales are taxable supplies, but only subscription.charged ever produced a GST
-- invoice. amount_inr here is the GST-INCLUSIVE gross; the callback splits it
-- (computeInclusiveGst) and writes these in the same txn as the PENDING -> COMPLETED
-- claim, with the invoice number allocated in that txn so a rollback never burns one.
-- gst_amount and gst_invoice_number already exist (unused until now).
-- ADDITIVE ONLY: nullable columns on an existing table. No new table, grant or RLS
-- change needed (the table keeps its existing policy + grants).
-- Idempotent. Rollback: ALTER TABLE "quota_addon_purchases" DROP COLUMN ... (each below).

ALTER TABLE "quota_addon_purchases"
  ADD COLUMN IF NOT EXISTS "amount_excluding_gst" INTEGER,
  ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(4,4),
  ADD COLUMN IF NOT EXISTS "cgst_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "sgst_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "igst_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "place_of_supply" TEXT,
  ADD COLUMN IF NOT EXISTS "sac_code" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_r2_key" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_generated_at" TIMESTAMP(3);
