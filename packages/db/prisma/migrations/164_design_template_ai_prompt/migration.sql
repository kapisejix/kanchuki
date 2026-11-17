-- 164: design_templates.ai_prompt (AI poster styles).
-- NOT APPLIED by the agent; the owner applies it, BEFORE the API deploy that reads
-- this column (RC-160: code reading a new column ahead of its migration 500s
-- every whole-row query on the table).
--
-- A design with ai_prompt set is an "AI style": the retailer's product photo is
-- composed into a poster by the AI model using this prompt, instead of rendering
-- the layer spec. NULL = a normal layered design. An AI style holds exactly one
-- product, so a second CHECK ties ai_prompt to product_slots = 1.
-- ADDITIVE ONLY: one nullable column + two CHECKs on an existing table. No new
-- GRANT or RLS change needed: table-level grants and the existing policy already
-- cover new columns.
-- Rollback:
--   ALTER TABLE "design_templates" DROP CONSTRAINT IF EXISTS "design_templates_ai_prompt_one_slot";
--   ALTER TABLE "design_templates" DROP CONSTRAINT IF EXISTS "design_templates_ai_prompt_len";
--   ALTER TABLE "design_templates" DROP COLUMN IF EXISTS "ai_prompt";

ALTER TABLE "design_templates" ADD COLUMN IF NOT EXISTS "ai_prompt" TEXT;

ALTER TABLE "design_templates" DROP CONSTRAINT IF EXISTS "design_templates_ai_prompt_len";
ALTER TABLE "design_templates" ADD CONSTRAINT "design_templates_ai_prompt_len"
  CHECK ("ai_prompt" IS NULL OR char_length("ai_prompt") BETWEEN 1 AND 600);

ALTER TABLE "design_templates" DROP CONSTRAINT IF EXISTS "design_templates_ai_prompt_one_slot";
ALTER TABLE "design_templates" ADD CONSTRAINT "design_templates_ai_prompt_one_slot"
  CHECK ("ai_prompt" IS NULL OR "product_slots" = 1);
