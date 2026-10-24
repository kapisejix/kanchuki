-- 137: Per-size product stock (docs/tasks/pending/product-stock-quantity.md).
--
-- One row per (product, size); size 'FREE' = unsized item. A product with no rows is
-- "not tracked" and behaves exactly as before, so there is NO backfill.
-- ADDITIVE ONLY: one new table, indexes, FKs, RLS. Nothing existing is altered.
--
-- No hard deletes from the app (RC-049): removing a size writes quantity 0.
-- kanchuki_app gets SELECT/INSERT/UPDATE from ALTER DEFAULT PRIVILEGES
-- (scripts/setup-role-separation.sql §19.1), which is all this feature needs. Both FKs
-- are ON DELETE CASCADE, so the retailer hard-delete path needs no list entry (RC-050).
-- kanchuki_purge still gets DELETE below as belt-and-braces, per 127/135.
--
-- quantity CHECK >= 0 so a future checkout can decrement atomically
-- (UPDATE ... SET quantity = quantity - n WHERE quantity >= n).
--
-- RLS follows 126/127/133/135: policy for the two backend roles first, then ENABLE,
-- so there is never a window where RLS is on and the API sees 0 rows (RC-030).
-- Idempotent: table, indexes and FKs are guarded.

CREATE TABLE IF NOT EXISTS "product_stock" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_stock_quantity_chk" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_stock_product_id_size_key"
  ON "product_stock"("product_id", "size");
CREATE INDEX IF NOT EXISTS "product_stock_retailer_id_idx"
  ON "product_stock"("retailer_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_product_id_fkey') THEN
    ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_retailer_id_fkey') THEN
    ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '137: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT DELETE ON "product_stock" TO kanchuki_purge;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'product_stock'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'product_stock'
    );
  END IF;

  ALTER TABLE "product_stock" ENABLE ROW LEVEL SECURITY;
END $$;
