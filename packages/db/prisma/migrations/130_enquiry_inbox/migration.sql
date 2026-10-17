-- 130: F-044 enquiry basket → team inbox (docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md §11.7 E1).
--
-- product_ids: every product the customer sent (product_id stays = product_ids[0] for old readers).
-- assigned_staff_id: Staff.id, or retailer.id for an owner Take — no FK on purpose (two target tables).
--
-- Additive + idempotent. No new table, so RLS (001/111) and grants (084) are unchanged.
-- A constant DEFAULT on ADD COLUMN is metadata-only on PG16 (no table rewrite).
--
-- DEPLOY ORDER: apply this BEFORE the API code that writes product_ids is deployed,
-- or every customer enquiry 500s on the missing column.
--
-- Rollback:
--   ALTER TABLE collection_enquiries
--     DROP COLUMN IF EXISTS product_ids,
--     DROP COLUMN IF EXISTS assigned_staff_id,
--     DROP COLUMN IF EXISTS assigned_at;

ALTER TABLE collection_enquiries
  ADD COLUMN IF NOT EXISTS product_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP(3);

UPDATE collection_enquiries
SET product_ids = ARRAY[product_id]
WHERE product_id IS NOT NULL AND product_ids = '{}';
