-- 084: Grant DELETE to kanchuki_purge on tables used by hardDeleteRetailer
-- that were missing from the original role-separation setup (037/082).
-- Without these grants, DELETE /retailers/me (retailer self-delete) and
-- DELETE /admin/retailers (admin hard-delete) fail with permission denied
-- on the social_posts, social_accounts, product_attributes, product_videos,
-- and quota_addon_purchases tables.

GRANT DELETE ON TABLE
  social_posts,
  social_accounts,
  product_attributes,
  product_videos,
  quota_addon_purchases
TO kanchuki_purge;
