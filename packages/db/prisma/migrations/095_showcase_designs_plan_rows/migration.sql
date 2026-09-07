-- 095: Suits Designs — plan feature + quota rows (docs/tasks/suits-designs.md).
--
-- Runs AFTER 094 (which adds the enum values) so SHOWCASE_DESIGNS is committed
-- and usable here in a fresh transaction (avoids PostgreSQL 55P04).
--
-- Feature gating (§14 decision 1): SHOWCASE_DESIGNS ON for all plans — admin
-- can restrict any tier in the plan-feature matrix afterwards. hasFeature()
-- fails closed, so without these rows the feature would be OFF everywhere.
--
-- Upload cap (§14 decision 2): a SHOWCASE_DESIGNS PlanLimit row per tier
-- (Starter 20 / Growth 60 / Pro 200), period LIFETIME. Unlike the metered
-- resources (which count via usage_counters with no decrement), the design
-- cap is enforced as a LIVE count of a retailer's active rows — delete frees
-- capacity — so the create route reads this plan_limits row directly and
-- counts showcase_designs where retailer_id = self AND is_active, instead of
-- checkQuota()/incrementUsage() (see lib/showcase-quota.ts, Phase 3).

INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  ('STARTER', 'SHOWCASE_DESIGNS', true),
  ('GROWTH',  'SHOWCASE_DESIGNS', true),
  ('PRO',     'SHOWCASE_DESIGNS', true);

INSERT INTO "plan_limits" ("id", "plan", "resource_type", "limit_per_period", "period", "created_at", "updated_at") VALUES
  ('shw_limit_starter', 'STARTER', 'SHOWCASE_DESIGNS', 20,   'LIFETIME', now(), now()),
  ('shw_limit_growth',  'GROWTH',  'SHOWCASE_DESIGNS', 60,   'LIFETIME', now(), now()),
  ('shw_limit_pro',     'PRO',     'SHOWCASE_DESIGNS', 200,  'LIFETIME', now(), now());
