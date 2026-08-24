-- Plan feature gate (F-013 matrix): Growth + Pro enabled for
-- PARTNER_NETWORK and INCENTIVE_ENGINE, matching the GROWTH_ENGINE tier
-- these two roadmap features ship under. Starter stays off.
--
-- Runs AFTER 076 (which adds the enum values) so they're committed —
-- using them here in a fresh transaction avoids PostgreSQL 55P04.

INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  ('GROWTH', 'PARTNER_NETWORK', true),
  ('PRO', 'PARTNER_NETWORK', true),
  ('GROWTH', 'INCENTIVE_ENGINE', true),
  ('PRO', 'INCENTIVE_ENGINE', true);
