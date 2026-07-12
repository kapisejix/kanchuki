-- Migration: training_photo_consent
-- Consent-gated VTO training-data collection (docs/PRO-REQUIREMENTS.md F-102d).
-- Uses DO blocks for idempotency since the column or table may already exist.

-- ─── Add consent_to_training column if not present ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'try_on_jobs' AND column_name = 'consent_to_training'
  ) THEN
    ALTER TABLE "try_on_jobs" ADD COLUMN "consent_to_training" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── Create training_photo_consents table if not present ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'training_photo_consents'
  ) THEN
    CREATE TABLE "training_photo_consents" (
      "id" TEXT NOT NULL,
      "try_on_job_id" TEXT NOT NULL,
      "customer_photo_r2_key" TEXT NOT NULL,
      "garment_photo_r2_key" TEXT NOT NULL,
      "result_r2_key" TEXT,
      "consent_version" TEXT NOT NULL,
      "source" "TryOnSource" NOT NULL,
      "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "training_photo_consents_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- ─── Unique index on try_on_job_id ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE tablename = 'training_photo_consents'
    AND indexname = 'training_photo_consents_try_on_job_id_key'
  ) THEN
    CREATE UNIQUE INDEX "training_photo_consents_try_on_job_id_key"
      ON "training_photo_consents"("try_on_job_id");
  END IF;
END $$;

-- ─── RLS: enabled with zero policies (default-deny) ───────────────
-- training_photo_consents is deliberately admin-only: no retailer_id column,
-- RLS enabled with ZERO policies for anon/authenticated roles — only the
-- backend's service-role key (which bypasses RLS in Supabase) can read or
-- write it. Retailers must never see which of their customers opted in, or
-- any of the retained photos, per the user's requirement that this data live
-- separately from the vendor-facing side of the product.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'training_photo_consents'
  ) THEN
    ALTER TABLE "training_photo_consents" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ─── Revocation token column ──────────────────────────────────────
-- Added in migration 009, but check here too for safety if 009 wasn't
-- applied before 008.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_photo_consents' AND column_name = 'revocation_token'
  ) THEN
    ALTER TABLE "training_photo_consents" ADD COLUMN "revocation_token" TEXT;
    UPDATE "training_photo_consents" SET "revocation_token" = gen_random_uuid()::text
      WHERE "revocation_token" IS NULL;
    ALTER TABLE "training_photo_consents" ALTER COLUMN "revocation_token" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "training_photo_consents_revocation_token_key"
      ON "training_photo_consents"("revocation_token");
  END IF;
END $$;
