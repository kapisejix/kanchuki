-- Migration: product_background_images
-- F-011: admin-curated backdrop library. Retailer picks a background for a
-- product; cleanupProductPhoto() composites the bg-stripped cutout onto it
-- instead of the default white flatten. Reuses the existing bg-removal +
-- sharp compositing already in packages/ai/src/detector.ts — no new AI cost.

-- CreateTable
CREATE TABLE "background_images" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_images_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "background_image_id" TEXT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_background_image_id_fkey" FOREIGN KEY ("background_image_id") REFERENCES "background_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
-- background_images is global admin config (no retailer_id column) — same
-- deny-all pattern as plan_limits (020_quota_system): RLS enabled, no
-- policy, so it's deny-all to `authenticated`. Only the backend service-role
-- key (bypasses RLS) reads/writes it — admin CRUD + retailer picker both go
-- through apps/api, not direct Supabase client access.
ALTER TABLE "background_images" ENABLE ROW LEVEL SECURITY;
