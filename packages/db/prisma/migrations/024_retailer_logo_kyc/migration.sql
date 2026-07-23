-- F-009: Store logo (optional) + KYC verification documents (GST certificate,
-- Aadhar front/back) for retailer identity proof. Mandatory-address is
-- enforced at the API/UI layer, not the DB, since address_line1 predates
-- this requirement and existing rows may not have it set.
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');

ALTER TABLE "retailers"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "logo_r2_key" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS "kyc_gst_url" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_gst_r2_key" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_aadhar_front_url" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_aadhar_front_r2_key" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_aadhar_back_url" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_aadhar_back_r2_key" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kyc_reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kyc_rejection_reason" TEXT;
