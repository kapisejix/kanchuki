-- 124: Grant DELETE on campaigns to kanchuki_purge.
--
-- DELETE /v1/growth/campaigns/:id used raw prisma.campaign.delete() on the main
-- kanchuki_app client, which has DELETE revoked platform-wide (SECURITY §19.1) ->
-- "42501: permission denied for table campaigns". Same bug class as RC-004/RC-028/RC-029.
-- The route now deletes via the scoped purge role; this is the matching GRANT.
-- Idempotent: GRANT is safe to repeat.
--
-- Same migration also re-asserts DELETE for every table hardDeleteRetailer()
-- (apps/api/src/jobs/purge-retailer-now.ts) touches that no earlier GRANT named,
-- incl. 5 tables that were also missing from the delete list (social_templates,
-- channel_syncs, product_reviews, store_reviews, bug_reports) — a missing
-- RESTRICT-FK child made `DELETE FROM retailers` throw and the whole self-delete
-- transaction roll back ("Retailer account not able to delete").
-- Granted one by one; absent tables are skipped so one unapplied migration can't abort the rest.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campaigns',
    'campaign_sends',
    'consent_events',
    'customer_interactions',
    'customer_recently_viewed',
    'customer_wishlist_items',
    'referral_payouts',
    'referral_conversions',
    'referral_codes',
    'referral_payout_accounts',
    'staff_invites',
    'social_templates',
    'channel_syncs',
    'product_reviews',
    'store_reviews',
    'bug_reports'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping % (table does not exist)', t;
    ELSE
      EXECUTE format('GRANT DELETE ON TABLE %I TO kanchuki_purge', t);
    END IF;
  END LOOP;
END
$$;
