-- Migration: public_write_rls_hardening
-- Closes gaps found in a security-advisor review:
--   1. _prisma_migrations was public + RLS disabled (anon could read migration
--      history via PostgREST). Enable RLS, no policies (deny-all, service role
--      still bypasses for Prisma migrate itself).
--   2. collection_enquiries / collection_views anon INSERT policies used
--      WITH CHECK (true) — retailer_id is a denormalized column, not FK-checked
--      against collection_id's real owner, so a caller hitting Supabase's
--      PostgREST directly (bypassing the API) could spoof retailer_id. The
--      Fastify API itself was never affected — it derives retailer_id
--      server-side via Prisma, which uses a service-role connection that
--      bypasses RLS entirely (see apps/api/src/routes/public.ts). This is
--      defense-in-depth for any future direct-to-Supabase client.
--   3. pgvector extension lived in public schema (Supabase lint: extension_in_public).
--      Moved to extensions schema (already on search_path).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = '_prisma_migrations' AND rowsecurity = true
  ) THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ALTER POLICY is idempotent (no error on re-run, just resets the clause)
ALTER POLICY "public_insert_enquiries" ON "collection_enquiries"
  WITH CHECK (
    retailer_id = (SELECT c.retailer_id FROM collections c WHERE c.id = collection_enquiries.collection_id)
    AND (product_id IS NULL OR EXISTS (
      SELECT 1 FROM collection_products cp
      WHERE cp.collection_id = collection_enquiries.collection_id
        AND cp.product_id = collection_enquiries.product_id
    ))
  );

ALTER POLICY "public_insert_views" ON "collection_views"
  WITH CHECK (
    retailer_id = (SELECT c.retailer_id FROM collections c WHERE c.id = collection_views.collection_id)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END $$;
