-- Migration: product_spin_frames
-- 360-degree product view: retailer uploads a short spin video, backend
-- ffmpeg-extracts evenly-spaced frames into this table. Kept separate from
-- product_photos (not merged in) so the existing 10-photo cap and photo
-- gallery/count logic don't need to special-case spin frames.

-- AlterTable
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "spin_status" TEXT,
  ADD COLUMN IF NOT EXISTS "spin_error" TEXT;

-- CreateTable
CREATE TABLE "product_spin_frames" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "frame_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_spin_frames_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_spin_frames_product_id_idx" ON "product_spin_frames"("product_id");

-- AddForeignKey
ALTER TABLE "product_spin_frames" ADD CONSTRAINT "product_spin_frames_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (retailer isolation, matches product_photos in 016_unbuilt_feature_rls_policies)
ALTER TABLE "product_spin_frames" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_product_spin_frames" ON "product_spin_frames"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
