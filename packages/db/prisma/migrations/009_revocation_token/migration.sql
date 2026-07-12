-- Migration: revocation_token
-- Adds a customer-facing revocation token to training_photo_consents so that
-- customers can withdraw their training-data consent and request deletion of
-- their retained photos without needing a login.
-- See docs/SECURITY.md §3b and docs/PRO-REQUIREMENTS.md F-102d.

-- revocation_token: a random, unguessable string generated server-side at
-- consent-save time. The token is returned to the customer via the try-on
-- result screen and can be presented at /consent/revoke to prove ownership
-- of a specific training-data record. Unique, non-nullable, indexable.
ALTER TABLE "training_photo_consents" ADD COLUMN "revocation_token" TEXT;

-- Backfill existing rows (which have no token) with a generated token so the
-- column can be made NOT NULL. Uses a random UUID — not meaningful, but every
-- consent row needs a revocable token for consistency.
UPDATE "training_photo_consents" SET "revocation_token" = gen_random_uuid()::text WHERE "revocation_token" IS NULL;

-- Now enforce NOT NULL and uniqueness
ALTER TABLE "training_photo_consents" ALTER COLUMN "revocation_token" SET NOT NULL;
ALTER TABLE "training_photo_consents" ADD CONSTRAINT "training_photo_consents_revocation_token_key" UNIQUE ("revocation_token");
