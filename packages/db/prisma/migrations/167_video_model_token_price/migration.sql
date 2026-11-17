-- F-034 T4: token-priced video models (Seedance) need their price in the DB too,
-- so no price lives in code. NULL = not token-priced (use price_usd_per_second).
-- Price per fal.ai/models/fal-ai/bytedance/seedance/v1/pro/fast/image-to-video
-- on 2026-11-17: $1.00 per 1M video tokens, tokens = h * w * fps * seconds / 1024.
-- Column add inherits the table's existing grants and RLS policy (166).
ALTER TABLE "video_models" ADD COLUMN "price_usd_per_million_tokens" DECIMAL(10,4);

UPDATE "video_models"
   SET "price_usd_per_million_tokens" = 1.0000
 WHERE "model_key" = 'seedance_1_pro_fast';
