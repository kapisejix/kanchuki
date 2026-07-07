-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('PHOTO', 'MANUAL');

-- CreateTable
CREATE TABLE "customer_measurements" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "source" "MeasurementSource" NOT NULL,
    "height_cm" DOUBLE PRECISION NOT NULL,
    "bust_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "pant_waist_cm" DOUBLE PRECISION,
    "pant_hip_cm" DOUBLE PRECISION,
    "inseam_cm" DOUBLE PRECISION,
    "front_photo_r2_key" TEXT,
    "back_photo_r2_key" TEXT,
    "photo_deleted_at" TIMESTAMP(3),
    "pose_landmarks_json" JSONB,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_measurements_pkey" PRIMARY KEY ("id")
);

-- AddColumn (link try-on jobs to the measurement snapshot used for fit)
ALTER TABLE "try_on_jobs" ADD COLUMN "measurement_id" TEXT;

-- CreateIndex
CREATE INDEX "customer_measurements_customer_id_idx" ON "customer_measurements"("customer_id");
CREATE INDEX "customer_measurements_retailer_id_idx" ON "customer_measurements"("retailer_id");

-- AddForeignKey
ALTER TABLE "customer_measurements" ADD CONSTRAINT "customer_measurements_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_measurement_id_fkey"
  FOREIGN KEY ("measurement_id") REFERENCES "customer_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (retailer isolation, matches pattern in 001_pgvector_indexes)
ALTER TABLE "customer_measurements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_customer_measurements" ON "customer_measurements"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));
