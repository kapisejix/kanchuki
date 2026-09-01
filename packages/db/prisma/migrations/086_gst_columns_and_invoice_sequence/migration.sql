-- GST columns on subscription_payments + GstInvoiceSequence for gap-free
-- invoice numbering. Applied via admin dashboard with approval.

-- Extend subscription_payments with full GST breakdown columns.
-- Existing columns: amount_excluding_gst, gst_amount, gst_invoice_number
-- (never populated). New columns store the computed split + PDF metadata.
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(4,4);
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "cgst_amount" INTEGER;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "sgst_amount" INTEGER;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "igst_amount" INTEGER;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "place_of_supply" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "sac_code" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "invoice_pdf_url" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "invoice_generated_at" TIMESTAMPTZ;

-- Gap-free per-FY invoice number counter.
-- One row per financial year, incremented in a Prisma interactive txn
-- (SELECT ... FOR UPDATE) so concurrent webhooks can't collide.
CREATE TABLE IF NOT EXISTS "gst_invoice_sequences" (
  "financial_year" TEXT NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "gst_invoice_sequences_pkey" PRIMARY KEY ("financial_year")
);
