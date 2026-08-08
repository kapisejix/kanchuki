-- F-028 auto-contrast background selection (dark garment → light backdrop,
-- light garment → dark backdrop).
-- The admin uploads background images as today; the API now computes each
-- image's tone (average WCAG relative luminance) at register time and stores
-- it here so the AI tagging / pro-cleanup pipeline can pick the opposite-tone
-- backdrop for every new product photo without classifying on every run.
-- null tone = unclassified → never auto-picked (only explicit retailer picks
-- or white use it).

CREATE TYPE "BackgroundTone" AS ENUM ('LIGHT', 'DARK');

ALTER TABLE "background_images"
  ADD COLUMN "tone" "BackgroundTone";
