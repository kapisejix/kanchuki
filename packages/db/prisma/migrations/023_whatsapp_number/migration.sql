-- F-009: Separate WhatsApp business number for collection links & remote try-on.
-- Falls back to `phone` if unset. Validated as 10-digit Indian mobile number.
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "whatsapp_number" TEXT;
