-- AlterEnum: Add SOCIAL_TEMPLATES to PlanFeatureKey
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'SOCIAL_TEMPLATES';

-- CreateEnum
CREATE TYPE "SocialTemplateType" AS ENUM ('INSTAGRAM_POST', 'INSTAGRAM_REEL', 'INSTAGRAM_STORY', 'WHATSAPP_STATUS', 'WHATSAPP_CATALOG', 'FACEBOOK_POST', 'FACEBOOK_STORY', 'PDF_FLYER');

-- CreateTable: AI Social Media Templates
CREATE TABLE "social_templates" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_type" "SocialTemplateType" NOT NULL DEFAULT 'INSTAGRAM_POST',
    "occasion" TEXT,
    "platform" TEXT,
    "overlay_festival" TEXT,
    "background_style" TEXT,
    "image_url" TEXT,
    "image_r2_key" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_templates_retailer_id_idx" ON "social_templates"("retailer_id");

-- CreateIndex
CREATE INDEX "social_templates_template_type_idx" ON "social_templates"("template_type");

-- CreateIndex
CREATE INDEX "social_templates_occasion_idx" ON "social_templates"("occasion");

-- AddForeignKey
ALTER TABLE "social_templates" ADD CONSTRAINT "social_templates_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
