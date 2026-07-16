-- Public retailer profile page (QR scan target): a stable public slug, and
-- an optional pointer to the Collection the retailer wants to show as their
-- storefront catalog after the visitor passes the contact gate.
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "public_slug" TEXT;
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "storefront_collection_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "retailers_public_slug_key" ON "retailers"("public_slug");

-- Gated contact-form capture on that profile page writes into the existing
-- Customer table — gender + explicit consent to be contacted.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gender" "Gender";
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "consent_given" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "consent_at" TIMESTAMP(3);
