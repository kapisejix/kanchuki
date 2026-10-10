-- 125: Grant DELETE to kanchuki_app on tables the API hard-deletes through the main client.
--
-- kanchuki_app has DELETE revoked platform-wide (SECURITY §19.1, scripts/setup-role-separation.sql),
-- with exceptions only for background_images (setup script), product_photos (083),
-- showcase_designs (097) and staff_invites (099). Every other raw `prisma.<model>.delete()` /
-- `deleteMany()` therefore fails with "42501: permission denied for table <t>" — the same
-- bug class as RC-004 / RC-028 / RC-029 — and surfaces as a 500 (or, where the caller does
-- `.catch(() => {})`, as a silent no-op).
--
-- Affected callers (found by auditing every delete/deleteMany in apps/api/src):
--   social_templates          retailer + admin template delete
--   channel_syncs             Growth > Aggregators unlink
--   product_attributes        attribute delete
--   store_sections            store section delete
--   collection_products       A/B campaign variant-collection sync (deleteMany)
--   catalog_items             WhatsApp catalog sync / webhook removals
--   customer_wishlist_items   customer un-favourite (passport wishlist)
--   passport_sessions         session cleanup (error swallowed by caller)
--   team_member_territories   nested deleteMany on team-member territory update
--   ai_provider_configs, studio_styles, integration_settings, resource_packs,
--   design_references, showcase_design_categories, post_templates,
--   retailer_limit_overrides  admin-only global config with a genuine delete UI
--
-- None of these has a deleted_at column (no soft-delete path exists), none is a
-- SECURITY §19 business model (those keep their DELETE revoked + trigger), and the
-- deletes are single-row config / join / ephemeral rows — same reasoning as the
-- background_images / showcase_designs exceptions. Owner-approved (Option A).
-- Idempotent: GRANT is safe to repeat.
-- Tables are granted one by one and skipped when absent: a table whose creating migration
-- was never applied (design_references / 069 on this DB) must not abort the other grants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_templates',
    'channel_syncs',
    'product_attributes',
    'store_sections',
    'collection_products',
    'catalog_items',
    'customer_wishlist_items',
    'passport_sessions',
    'team_member_territories',
    'ai_provider_configs',
    'studio_styles',
    'integration_settings',
    'resource_packs',
    'design_references',
    'showcase_design_categories',
    'post_templates',
    'retailer_limit_overrides'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping % (table does not exist)', t;
    ELSE
      EXECUTE format('GRANT DELETE ON TABLE %I TO kanchuki_app', t);
    END IF;
  END LOOP;
END
$$;
