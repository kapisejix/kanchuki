-- F-018: Sales Referral Attribution (Self-Serve Signup)
-- A short unique code per marketing agent that a retailer can enter during
-- self-serve onboarding to attribute the signup to that agent via the
-- existing onboarded_by_id field (no new attribution mechanism).

ALTER TABLE team_members ADD COLUMN referral_code TEXT;

CREATE UNIQUE INDEX team_members_referral_code_key ON team_members (referral_code);
