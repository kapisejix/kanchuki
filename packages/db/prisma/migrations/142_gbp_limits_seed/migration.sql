-- 142: Google Business Profile — reply quota seed. Requires 140 applied in an earlier file.
--
-- ONLY plan_limits rows are seeded. There is deliberately NO plan_features row for
-- GOOGLE_BUSINESS_PROFILE: feature keys fail CLOSED (no row = OFF), so the integration is
-- invisible and every route refuses until an admin turns it on per plan in
-- Admin -> Plan Feature Matrix (after Google approves API access).
--
-- Numbers are the proposed defaults (decision D8) and are admin-editable afterwards:
--   Starter 20 / Growth 100 / Pro 500 replies per month.
--
-- Rollback: DELETE FROM "plan_limits" WHERE "resource_type" = 'GBP_REVIEW_REPLY';

INSERT INTO "plan_limits" ("id", "plan", "resource_type", "limit_per_period", "period", "created_at", "updated_at")
VALUES
  ('plt_gbpreply_starter', 'STARTER', 'GBP_REVIEW_REPLY',  20, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_gbpreply_growth',  'GROWTH',  'GBP_REVIEW_REPLY', 100, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_gbpreply_pro',     'PRO',     'GBP_REVIEW_REPLY', 500, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("plan", "resource_type") DO NOTHING;
