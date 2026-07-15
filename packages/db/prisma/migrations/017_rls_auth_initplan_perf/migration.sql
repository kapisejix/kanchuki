-- Migration: rls_auth_initplan_perf
-- Supabase perf lint (auth_rls_initplan): policies created in earlier
-- migrations (001, 002, 006, 010, 011) call auth.uid() directly in USING,
-- which re-evaluates per row. Wrapping in (select auth.uid()) makes Postgres
-- evaluate it once per query instead. Functionally identical, faster at scale.
-- ALTER POLICY is idempotent — safe to re-run.
--
-- Tables added in 016_unbuilt_feature_rls_policies already use the
-- (select auth.uid()) form and don't need altering here.

ALTER POLICY "retailer_own_products" ON "products"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_customers" ON "customers"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_collections" ON "collections"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_retailers" ON "retailers"
  USING (auth_user_id = ((select auth.uid()))::text);

ALTER POLICY "retailer_own_size_charts" ON "size_charts"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_size_chart_rows" ON "size_chart_rows"
  USING (size_chart_id IN (
    SELECT sc.id FROM size_charts sc
    WHERE sc.retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text)
  ));

ALTER POLICY "retailer_own_customer_measurements" ON "customer_measurements"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_try_on_jobs" ON "try_on_jobs"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

ALTER POLICY "retailer_own_try_on_usage_logs" ON "try_on_usage_logs"
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));
