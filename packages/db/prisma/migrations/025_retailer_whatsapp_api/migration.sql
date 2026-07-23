-- Retailer-owned Meta WhatsApp Business API config (bring-your-own credentials).
-- Optional — retailers without this configured keep using the one-by-one
-- wa.me share flow; collection bulk-send uses this when present.
ALTER TABLE "retailers"
  ADD COLUMN IF NOT EXISTS "whatsapp_api_phone_number_id" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_api_access_token" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_api_template_name" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_api_template_lang" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_api_configured_at" TIMESTAMP(3);
