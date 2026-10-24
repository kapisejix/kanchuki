-- 136: Backend-role RLS policies for the 51 RLS-enabled tables that still have
-- no policy at all (security audit T4, owner approved 2026-10-22).
--
-- Live check 2026-10-22 (project thpqcylmcxokajxoerjx): all 86 public tables have
-- RLS on. 52 had NO policy, which is deny-all for `anon` / `authenticated` (a
-- leaked anon key reads nothing - correct, and unchanged here). The backend still
-- works today only because `kanchuki_app` / `kanchuki_purge` carry BYPASSRLS.
--
-- This migration is a guard, not a fix of a live outage: it names the two backend
-- roles on each table, the same `backend_roles_full_access` policy that 111 and
-- 126/127/129/133/134/135 add, so the backend keeps working if BYPASSRLS is ever
-- removed from those roles (the RC-030 silent-0-rows failure). PERMISSIVE and
-- scoped to the two backend roles only, so `anon` / `authenticated` isolation is
-- untouched. RLS cannot grant a privilege; the REVOKE DELETE in
-- scripts/setup-role-separation.sql still applies.
--
-- `_prisma_migrations` is left out on purpose (Prisma bookkeeping, no app reads).
-- `customer_interactions` is also in 111's list, but 082 dropped and a later
-- migration recreated that table, losing the policy; it is re-covered here.
--
-- Idempotent: skips a table that is gone and a table that already has the policy.

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
  tables constant text[] := ARRAY[
    '_RelatedShowcaseCategories',
    'admin_commission_expenses',
    'ai_provider_configs',
    'background_images',
    'bug_reports',
    'campaign_sends',
    'campaigns',
    'catalog_items',
    'catalog_sync_logs',
    'catalog_upload_price_tiers',
    'channel_syncs',
    'customer_accounts',
    'customer_engagement_summaries',
    'customer_interactions',
    'customer_resource_limits',
    'customer_usage_counters',
    'default_product_attributes',
    'default_product_categories',
    'festivals',
    'gst_invoice_sequences',
    'hsn_rules',
    'integration_settings',
    'passport_sessions',
    'plan_features',
    'plan_limits',
    'plan_pricing',
    'platform_gst_profile',
    'post_templates',
    'product_attributes',
    'product_reviews',
    'product_videos',
    'promotions',
    'referral_codes',
    'referral_conversions',
    'referral_payout_accounts',
    'referral_payouts',
    'referral_settings',
    'resource_packs',
    'retailer_engagement_daily',
    'showcase_design_categories',
    'showcase_designs',
    'social_accounts',
    'social_posts',
    'social_templates',
    'staff_invites',
    'store_reviews',
    'studio_styles',
    'team_member_territories',
    'team_members',
    'territories',
    'try_on_jobs'
  ];
  t text;
BEGIN
  -- CREATE POLICY naming a missing role is a hard error that would abort
  -- `prisma migrate deploy` on a fresh environment; warn and skip instead.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '136: kanchuki_app/kanchuki_purge missing - skipping backend RLS policies. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    -- format('%I') quotes the mixed-case Prisma m2m table name.
    IF to_regclass(format('%I', t)) IS NULL THEN
      RAISE WARNING '136: table % does not exist - skipped', t;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t
        AND policyname = policy_name
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      t
    );
  END LOOP;
END $$;
