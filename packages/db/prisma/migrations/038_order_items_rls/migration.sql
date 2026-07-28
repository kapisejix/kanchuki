-- Fixes RLS gap: order_items (added in 031_l2_ecommerce_checkout) never got
-- Row Level Security, unlike every other retailer-scoped table (orders,
-- collection_products, product_variants, etc.). order_items has no
-- retailer_id column directly — isolation is scoped through order_id.

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_order_items" ON "order_items"
  FOR ALL TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE retailer_id IN (
        SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text
      )
    )
  );
