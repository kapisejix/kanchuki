-- 150: Restore the kanchuki_app DELETE exceptions (RC-162). NOT APPLIED by the agent; the owner applies it.
--
-- Read-only check on prod 2026-11-03: kanchuki_app holds DELETE on background_images ONLY.
-- Every other exception that 083, 097, 099 and 125 were meant to grant is missing, so the
-- routes below fail with "42501: permission denied" (a 500, or a silent no-op where the caller
-- swallows it) - e.g. DELETE /v1/admin/retailers/:id/limit-overrides/:overrideId.
--
-- Why they are missing is not established. _prisma_migrations shows 090-099 and 120-132 all
-- finished at the identical instant 2026-10-25 06:39:51 (looks like a bulk mark-as-applied, so
-- their SQL may never have run), and scripts/setup-role-separation.sql runs
-- `REVOKE DELETE, TRUNCATE ON ALL TABLES ... FROM kanchuki_app`, which undoes any grant if it is
-- re-run (RC-137). Either would produce this state; this migration is correct under both.
--
-- Same table list and same owner approval (Option A) as 125, plus the three older exceptions
-- (083 product_photos, 097 showcase_designs, 099 staff_invites). None has a deleted_at column
-- and none is a SECURITY section 19 business model.
--
-- Idempotent (GRANT is safe to repeat). A table that does not exist is skipped, so one absent
-- table cannot abort the rest.
--
-- Not covered: 084's grants (social_posts, social_accounts, product_videos, quota_addon_purchases)
-- and 109's referral tables go to a different set of roles and were not checked.
--
-- Rollback: REVOKE DELETE ON TABLE <t> FROM kanchuki_app;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_photos',
    'showcase_designs',
    'staff_invites',
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
