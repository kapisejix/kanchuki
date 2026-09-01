-- 084: Grant DELETE to kanchuki_purge on ALL tables used by hardDeleteRetailer
-- and purge-soft-deleted that were missing from the original role-separation
-- setup (037). Without these grants, DELETE /retailers/me and
-- DELETE /admin/retailers fail with permission denied.
--
-- Tables split into two groups:
-- A) Tables added AFTER the original 037 setup (social_posts, social_accounts,
--    product_attributes, product_videos, quota_addon_purchases) — never got
--    a GRANT DELETE.
-- B) Tables from the original grant that may have been recreated or need
--    re-assertion after migration 082 removed some FK columns.

-- Group A: new tables missing from original grant
GRANT DELETE ON TABLE
  social_posts,
  social_accounts,
  product_attributes,
  product_videos,
  quota_addon_purchases
TO kanchuki_purge;

-- Group B: re-assert DELETE on all tables hardDeleteRetailer touches
-- (idempotent — GRANT is safe to repeat)
GRANT DELETE ON TABLE
  product_variants, product_photos, product_embeddings,
  products,
  collection_products, collection_views, collection_enquiries,
  collections,
  subscription_payments, subscriptions,
  customers,
  support_tickets, ai_usage_logs,
  staff, store_sections, product_categories, usage_counters,
  retailers
TO kanchuki_purge;
