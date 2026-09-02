-- 087: private R2 key for GST invoice PDFs.
-- The PDF object now lives at a random-UUID key (not the sequential invoice
-- number) and is served only via a short-lived presigned URL. Store the real
-- key here so the download routes can sign it on demand.
-- Applied via admin dashboard with approval (CLAUDE.md operational policy).
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "invoice_r2_key" TEXT;
