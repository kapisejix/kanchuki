-- 158: Scan & Sell sales ledger (F-047, docs/tasks/pending/scan-billing-sell-screen.md §7).
-- NOT APPLIED by the agent; the owner applies it.
--
-- One row per (bill, product, size) sold. Rows are never deleted: Undo sets undone_at (RC-049).
-- UNIQUE (retailer_id, bill_id, product_id, size) is the durable idempotency guard: a replayed
-- bill hits it instead of decrementing stock twice. Retailer-scoped because bill_id comes from
-- the phone.
-- ADDITIVE ONLY: one new table, indexes, FKs, RLS. Nothing existing is altered.
-- Both FKs ON DELETE CASCADE, so hardDeleteRetailer() needs no list entry (RC-050).
-- sold_by_staff_id: Staff.id, NULL = the owner sold it. Plain column, no FK (like staff_push_devices),
--   so removing a staff row never blocks the sale history or a retailer purge.
-- unit_price: paise snapshot of products.price_min at sale time; NULL if the product had none.
--
-- Grants are explicit even though default privileges cover SELECT/INSERT/UPDATE, because RC-162
-- showed grants can be missing on prod. No DELETE for kanchuki_app; kanchuki_purge gets DELETE
-- as belt-and-braces (127/135/137).
-- RLS: policy first, then ENABLE, so there is never a window where RLS is on and the API sees 0 rows (RC-030).
-- Idempotent. Rollback: DROP TABLE "product_sales";

CREATE TABLE IF NOT EXISTS "product_sales" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER,
    "sold_by_staff_id" TEXT,
    "undone_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_sales_quantity_chk" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_sales_retailer_id_bill_id_product_id_size_key"
  ON "product_sales"("retailer_id", "bill_id", "product_id", "size");
CREATE INDEX IF NOT EXISTS "product_sales_retailer_id_created_at_idx"
  ON "product_sales"("retailer_id", "created_at");
CREATE INDEX IF NOT EXISTS "product_sales_product_id_idx"
  ON "product_sales"("product_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_sales_retailer_id_fkey') THEN
    ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_sales_product_id_fkey') THEN
    ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '158: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE ON "product_sales" TO kanchuki_app;
  GRANT DELETE ON "product_sales" TO kanchuki_purge;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'product_sales'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name, 'product_sales'
    );
  END IF;

  ALTER TABLE "product_sales" ENABLE ROW LEVEL SECURITY;
END $$;
