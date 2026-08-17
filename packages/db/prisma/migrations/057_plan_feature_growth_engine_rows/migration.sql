-- Plan feature gate (F-013 matrix): Growth + Pro enabled for GROWTH_ENGINE.
--
-- Runs AFTER 056 (which adds the enum value) so the value is committed —
-- using it here in a fresh transaction avoids PostgreSQL 55P04.

INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  ('GROWTH', 'GROWTH_ENGINE', true),
  ('PRO', 'GROWTH_ENGINE', true);
