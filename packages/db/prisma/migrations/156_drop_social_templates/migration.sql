-- 156: drop social_templates + SocialTemplateType (retired feature, code removed 2026-11-05).
-- NOT APPLIED by the agent; the owner applies it AFTER the API that no longer references the
-- table is deployed (purge-retailer-now used to DELETE FROM it; deploy-then-apply is the safe order).
--
-- BEFORE applying (owner):
--   select count(*) from social_templates;
--   pg_dump -t social_templates --data-only  (skip if count is 0)
-- Rollback: re-run the CREATE TABLE / CREATE TYPE / indexes / FK from 069_social_media_templates,
-- then restore the dump.
--
-- Kept on purpose: PlanFeatureKey value SOCIAL_TEMPLATES (removing an enum value needs a type rebuild).
-- Runs as the migrator role; kanchuki_app has no DROP privilege. Indexes and the retailers FK go with the table.

DROP TABLE IF EXISTS "social_templates";
DROP TYPE IF EXISTS "SocialTemplateType";
