-- Migration: training_photo_consent
-- Consent-gated VTO training-data collection (docs/PRO-REQUIREMENTS.md F-102d).
-- training_photo_consents is deliberately admin-only: no retailer_id column,
-- RLS enabled with ZERO policies for anon/authenticated roles — only the
-- backend's service-role key (which bypasses RLS in Supabase) can read or
-- write it. Retailers must never see which of their customers opted in, or
-- any of the retained photos, per the user's requirement that this data live
-- separately from the vendor-facing side of the product.

ALTER TABLE "try_on_jobs" ADD COLUMN "consent_to_training" BOOLEAN NOT NULL DEFAULT false;

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

CREATE UNIQUE INDEX "training_photo_consents_try_on_job_id_key" ON "training_photo_consents"("try_on_job_id");

-- RLS enabled, no policies added on purpose (default-deny for anon/authenticated).
ALTER TABLE "training_photo_consents" ENABLE ROW LEVEL SECURITY;
