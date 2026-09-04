-- 092: Fan-out idempotency fix (docs/tasks/social-create-post-composer.md T-3.1).
--
-- Migration 090 added @@unique([retailer_id, client_post_id]) on social_posts,
-- but the v2 fan-out publish writes ONE SocialPost row PER TARGET for a single
-- request — every row shares the same client_post_id, which the 090 unique
-- index would reject from the second row onward.
--
-- Scope uniqueness per (retailer, social account, client_post_id) instead:
-- the same request id can still never double-post to the SAME account, while
-- a fan-out to N accounts writes N distinct rows as intended.
--
-- Safe to swap: no row carries a client_post_id yet (only the legacy
-- single-target route exists; the composer + fan-out endpoint are new), so
-- dropping the 090 index loses nothing.

DROP INDEX "social_posts_retailer_id_client_post_id_key";

CREATE UNIQUE INDEX "social_posts_retailer_social_client_post_id_key"
  ON "social_posts"("retailer_id", "social_account_id", "client_post_id");
