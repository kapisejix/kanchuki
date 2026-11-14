-- 153: scheduled_post_items.design_vars — per-slide headline / offer text for an admin design.
-- NOT APPLIED by the agent; the owner applies it, and BEFORE the API that selects it is deployed
-- (a Prisma model with a column the DB lacks makes every whole-row query fail, RC-160).
--
-- Shape: {"custom_text"?: string, "offer_text"?: string}, each <= 80 chars (route-validated).
-- Only read when template_id is an admin design id; NULL = those layers render empty (skipped).
-- Nullable, no default, no backfill, idempotent. Existing grants on the table cover the column.
ALTER TABLE scheduled_post_items ADD COLUMN IF NOT EXISTS design_vars JSONB;
