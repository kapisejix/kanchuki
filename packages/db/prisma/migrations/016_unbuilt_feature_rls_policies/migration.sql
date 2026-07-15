-- Migration: unbuilt_feature_rls_policies
-- 9 tables backing not-yet-built features (Fashion DNA, product embeddings,
-- internal staff, billing, size charts, training consent) had RLS enabled
-- with zero policies — correct default-deny, but flagged as INFO by the
-- Supabase linter (rls_enabled_no_policy). Adding the same retailer-isolation
-- pattern used everywhere else (products, customers, collections) so the
-- policies are ready when each feature ships, instead of deferred.
--
-- audit_logs and _prisma_migrations are intentionally excluded — neither has
-- a retailer-scoping column, so deny-all stays correct (see 010_rls_try_on_audit_fix,
-- 015_public_write_rls_hardening).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'customer_fashion_dna') THEN
    CREATE POLICY "retailer_own_customer_fashion_dna" ON "customer_fashion_dna"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'customer_interactions') THEN
    CREATE POLICY "retailer_own_customer_interactions" ON "customer_interactions"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'product_embeddings') THEN
    CREATE POLICY "retailer_own_product_embeddings" ON "product_embeddings"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'product_photos') THEN
    CREATE POLICY "retailer_own_product_photos" ON "product_photos"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'product_variants') THEN
    CREATE POLICY "retailer_own_product_variants" ON "product_variants"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'staff') THEN
    CREATE POLICY "retailer_own_staff" ON "staff"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'store_sections') THEN
    CREATE POLICY "retailer_own_store_sections" ON "store_sections"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'subscription_payments') THEN
    CREATE POLICY "retailer_own_subscription_payments" ON "subscription_payments"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'subscriptions') THEN
    CREATE POLICY "retailer_own_subscriptions" ON "subscriptions"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
  END IF;

  -- no retailer_id column; scope through try_on_jobs which does carry it
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'training_photo_consents') THEN
    CREATE POLICY "retailer_own_training_photo_consents" ON "training_photo_consents"
      FOR ALL TO authenticated
      USING (
        try_on_job_id IN (
          SELECT t.id FROM try_on_jobs t
          WHERE t.retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text)
        )
      );
  END IF;
END $$;
