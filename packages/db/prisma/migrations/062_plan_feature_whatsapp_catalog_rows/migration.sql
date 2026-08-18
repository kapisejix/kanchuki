-- Plan feature gate (F-013 matrix): Growth + Pro enabled for
-- WHATSAPP_CATALOG_SYNC, Starter stays off (matches the Phase II roadmap).
--
-- Runs AFTER 061 (which adds the enum value) so the value is committed —
-- using it here in a fresh transaction avoids PostgreSQL 55P04.

INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  ('GROWTH', 'WHATSAPP_CATALOG_SYNC', true),
  ('PRO', 'WHATSAPP_CATALOG_SYNC', true);
