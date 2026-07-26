-- F-017: Database Guardrails — BEFORE DELETE OR TRUNCATE triggers
--
-- Layer 2 of the guardrail system (see docs/SECURITY.md §19):
-- Even if kanchuki_app somehow retains DELETE privileges (misconfiguration,
-- role change mistake), these triggers block hard deletes at the SQL level.
--
-- Only the 30-day purge cron (running with a session flag set) can bypass.
-- See: SET app.allow_hard_delete = 'true';
--
-- Layer 1 (Postgres role separation — kanchuki_app lacks DELETE/TRUNCATE/DROP)
-- is infra config applied outside this migration. See docs/SECURITY.md §19.1
-- for the role setup SQL.

-- 1. Create the guardrail trigger function
CREATE OR REPLACE FUNCTION prevent_hard_delete() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_hard_delete', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Hard delete blocked by guardrail trigger on % (F-017). Use soft-delete (deleted_at) or SET app.allow_hard_delete = ''true'' for the purge cron.',
      TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply triggers to every business table
-- The kanchuki_app role should never issue hard DELETE/TRUNCATE — only soft-delete
-- via SET deleted_at = now(). The 30-day purge cron sets the session flag.

CREATE TRIGGER guard_products_delete
  BEFORE DELETE OR TRUNCATE ON products
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_customers_delete
  BEFORE DELETE OR TRUNCATE ON customers
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_retailers_delete
  BEFORE DELETE OR TRUNCATE ON retailers
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_collections_delete
  BEFORE DELETE OR TRUNCATE ON collections
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_staff_delete
  BEFORE DELETE OR TRUNCATE ON staff
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_orders_delete
  BEFORE DELETE OR TRUNCATE ON orders
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_order_items_delete
  BEFORE DELETE OR TRUNCATE ON order_items
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

CREATE TRIGGER guard_product_variants_delete
  BEFORE DELETE OR TRUNCATE ON product_variants
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();

-- 3. Verify triggers are installed
-- Run: SELECT event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_name LIKE 'guard_%';
