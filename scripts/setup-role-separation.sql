-- ============================================================
-- F-017 Database Guardrails — Postgres Role Separation
-- ============================================================
-- Run this SQL in the Supabase SQL Editor (not via psql pooler).
-- These roles revoke DELETE/TRUNCATE/DROP from the app runtime.
--
-- ⚠️ SECURITY (2026-08-02): the previous hardcoded passwords were leaked to
-- a public GitHub repo (GitGuardian alert) and must NOT be reused. This file
-- now contains placeholders only. BEFORE running: generate 3 strong random
-- passwords (e.g. `openssl rand -base64 24`), replace the three
-- <*_PASSWORD_CHANGE_ME> tokens below, then run. Then set the same values in
-- Railway env vars / local .env. Never commit real passwords.
--
-- Idempotent: safe to re-run against an existing setup (the roles were
-- first created 2026-07-26; re-running applies the sequence grants and
-- default-privileges fixes below without failing on CREATE ROLE). Each role
-- block also re-asserts its password via ALTER ROLE, so a re-run ALIGNS the
-- password to the tokens below even when the role already exists (the
-- original 2026-07-26 run set different passwords — that mismatch caused
-- "password authentication failed" on the pooled DATABASE_URL).
--
-- Step 1: Open https://supabase.com/dashboard/projects
-- Step 2: Select your project (project ref = the `<PROJECT_REF>`
--         suffix in your pooler URLs — see the DATABASE_URL examples below;
--         confirm it on the dashboard's Connect tab if unsure)
-- Step 3: Open SQL Editor
-- Step 4: Paste and run this entire file
-- Step 5: Verify with the SELECTs at the bottom
-- Step 6: Update .env / Railway DATABASE_URL to use kanchuki_app credentials
--         (pooler usernames MUST include the project ref: <role>.<ref>)
-- ============================================================

-- ─── 1. Create the APPLICATION role ───────────────────────────
-- Used by DATABASE_URL for ALL runtime API/worker operations.
-- CANNOT delete, truncate, drop, alter, or create anything.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app') THEN
    CREATE ROLE kanchuki_app WITH LOGIN PASSWORD '<APP_PASSWORD_CHANGE_ME>';
  ELSE
    -- Role exists (first created 2026-07-26 with a different password) —
    -- re-align to the documented credential so the pooled DATABASE_URL works.
    ALTER ROLE kanchuki_app WITH LOGIN PASSWORD '<APP_PASSWORD_CHANGE_ME>';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE postgres TO kanchuki_app;
GRANT USAGE ON SCHEMA public TO kanchuki_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kanchuki_app;

-- The critical revocations — these make the guardrail work:
-- NOTE: DROP, ALTER, and CREATE are NOT table-level privileges in PostgreSQL.
-- They are controlled at the schema/database level. We omit CREATE on the
-- schema (kanchuki_app can't create new tables) and CREATEROLE/CREATEDB on
-- the database level. The app role specifically lacks DELETE and TRUNCATE.
REVOKE DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA public FROM kanchuki_app;

-- Future tables also get restricted automatically:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO kanchuki_app;

-- Per-table DELETE exceptions: admin-only global-config tables that have a
-- genuine hard-delete UI and no soft-delete column / deletion vault (i.e. not
-- SECURITY §19 user data). The blanket REVOKE above strips DELETE from these,
-- so re-grant it explicitly. No guard_* trigger covers these tables (037).
--   background_images — admin backdrop library trash button
--                       (DELETE /admin/background-images/:id)
GRANT DELETE ON TABLE background_images TO kanchuki_app;

-- Serial/identity sequences: without USAGE+SELECT, INSERTs that call
-- nextval() fail with "permission denied for sequence <name>". Cover
-- existing sequences AND ones created by future migrations:
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kanchuki_app;

-- ─── 2. Create the MIGRATOR role ─────────────────────────────
-- FULL privileges — for schema migrations and the 30-day purge cron.
-- NEVER put this in .env. Human-only via prisma migrate deploy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_migrator') THEN
    CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD_CHANGE_ME>' INHERIT;
  ELSE
    ALTER ROLE kanchuki_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD_CHANGE_ME>' INHERIT;
  END IF;
END
$$;

-- Inherits kanchuki_app's SELECT/INSERT/UPDATE, then adds full DDL
GRANT kanchuki_app TO kanchuki_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kanchuki_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO kanchuki_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO kanchuki_migrator;

-- ─── 3. Create the PURGE role (narrow-scoped hard-delete for the 30-day cron) ──
-- SECURITY §19: the purge cron must hard-delete soft-deleted rows >30 days old.
-- kanchuki_app cannot (DELETE revoked) and kanchuki_migrator must stay
-- human-only (never in any env file). kanchuki_purge is the sanctioned middle
-- ground: it inherits kanchuki_app's SELECT/INSERT/UPDATE (so it can also write
-- the PURGE_SOFT_DELETED audit-log row) plus DELETE on exactly the tables the
-- purge cron touches. NO TRUNCATE, NO DROP, NO DDL.
-- Used ONLY via PURGE_DATABASE_URL by apps/api/src/jobs/purge-soft-deleted.ts
-- (the getPurgePrisma() client) — NEVER as DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    CREATE ROLE kanchuki_purge WITH LOGIN PASSWORD '<PURGE_PASSWORD_CHANGE_ME>' INHERIT;
  ELSE
    ALTER ROLE kanchuki_purge WITH LOGIN PASSWORD '<PURGE_PASSWORD_CHANGE_ME>' INHERIT;
  END IF;
END
$$;
GRANT kanchuki_app TO kanchuki_purge;

-- Tables the purge role may DELETE from (children before parents).
--
-- This is a permission boundary, so it must be exact in BOTH directions:
--   * too FEW entries -> the job hits "permission denied for table <t>"
--     mid-sweep, and on the retailer paths the whole transaction rolls back,
--     so the delete silently does nothing (the product_attributes /
--     social_accounts omission, migrations 046/052).
--   * too MANY entries -> a name that no longer exists makes the GRANT
--     itself fail, aborting the rest of this script.
--
-- SCOPE OF THIS LIST. These are the tables that existed when this script was
-- written. Tables created later carry their OWN purge grant in the migration
-- that creates them, because ALTER DEFAULT PRIVILEGES does not cover this
-- role and a future table's name cannot appear here:
--   083 / 097 — kanchuki_app DELETE exceptions (product_photos,
--               showcase_designs, staff_invites)
--   084 — social_posts, social_accounts, product_attributes,
--         product_videos, quota_addon_purchases
--   099 — staff_invites
--   109 — referral_codes, referral_conversions, referral_payouts
-- Those grants are idempotent repeats of what is below where they overlap, so
-- the end state is the same whichever runs first.
--
-- PRUNED 2026-09-22: nine names here had been dropped by migration 082
-- (remove_unwanted_features) and were making this script abort at the GRANT
-- below. Removed: product_spin_frames, order_items, orders, try_on_jobs,
-- try_on_usage_logs, customer_measurements, customer_fashion_dna,
-- size_charts, size_chart_rows. Re-check this list against the schema
-- whenever a feature is torn down.
-- customer_interactions is NOT one of those: migration 082 dropped it and
-- migration 100 re-created it, so it must stay.
GRANT DELETE ON TABLE
  product_variants, product_photos, product_embeddings,
  products,
  collection_products, collection_views, collection_enquiries,
  collections,
  customers,
  subscription_payments, subscriptions,
  support_tickets, ai_usage_logs, quota_addon_purchases,
  staff, store_sections, product_categories, usage_counters,
  -- Smart Promotion / Discount Engine. Deleted through the purge role
  -- (RC-028) but never granted anywhere — so that delete failed with
  -- "permission denied for table promotions" even after RC-028 shipped.
  -- Migration 110 grants this too, so a normal `prisma migrate deploy`
  -- fixes it without anyone re-running this script (RC-029).
  promotions,
  -- Retailer referral program (migration 109) — RESTRICT FKs to retailers,
  -- so the sweep deletes them before the retailer row. referral_settings is
  -- absent on purpose: a global singleton, never deleted.
  referral_codes, referral_conversions, referral_payouts,
  -- Granted at HEAD and left alone: nothing deletes from it today, so this
  -- is inert, but removing a grant would be an unrequested privilege
  -- change. It is one of the RC-030 tables (bare `retailer_id`, no FK), so
  -- the cleanup fix will need it.
  customer_interactions,
  retailers
TO kanchuki_purge;

-- KNOWN GAP (RC-030): seven tables declare `retailer_id` as a bare scalar
-- with NO foreign key to retailers, so a retailer purge silently leaves
-- their rows behind:
--   campaigns, campaign_sends, promotions, consent_events,
--   customer_recently_viewed, customer_wishlist_items, customer_interactions
-- Two of the seven are granted above (`promotions`, `customer_interactions`)
-- but NEITHER is deleted by the purge jobs — the promotions grant unblocks
-- the retailer's own delete button for a single row (RC-028), and nothing
-- deletes customer_interactions at all. The grant list is a permission
-- boundary, not a list of what runs.
-- The other five are deliberately NOT granted yet, because a grant for a
-- delete that does not exist is privilege for nothing. The fix is the
-- cleanup and those grants together; see RC-030 in
-- docs/root-cause/root-cause issues.md.
-- `product_videos` shows the intended shape — bare retailer_id, deleted by
-- both purge jobs.

-- ─── 4. Verify ───────────────────────────────────────────────
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname LIKE 'kanchuki_%';
-- Expected: 3 rows — kanchuki_app, kanchuki_migrator, kanchuki_purge

-- Verify kanchuki_app cannot delete:
SELECT has_table_privilege('kanchuki_app', 'products', 'DELETE');
-- Expected: false

-- Verify kanchuki_app CAN insert (needs table + sequence privileges):
SELECT has_table_privilege('kanchuki_app', 'products', 'INSERT');
-- Expected: true

-- Verify kanchuki_migrator CAN delete (has full privileges via inheritance):
SELECT has_table_privilege('kanchuki_migrator', 'products', 'DELETE');
-- Expected: true

-- Verify kanchuki_purge CAN delete the purge tables:
SELECT has_table_privilege('kanchuki_purge', 'products', 'DELETE');
-- Expected: true (purge role — hard-delete is its only job)

-- Verify kanchuki_purge CANNOT truncate or drop (no DDL):
SELECT has_table_privilege('kanchuki_purge', 'products', 'TRUNCATE');
-- Expected: false

-- ============================================================
-- AFTER running this SQL, update your .env files:
-- ============================================================
-- NOTE: Supabase's pooler (port 6543, and the pooler host on 5432) requires
-- usernames in <role>.<project_ref> form. The bare `kanchuki_app` username
-- is REJECTED with "password authentication failed" — the suffix below is
-- required. Substitute your project ref if it differs from this one.
--
-- .env (root):
--   DATABASE_URL=postgresql://kanchuki_app.<PROJECT_REF>:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--
-- packages/db/.env:
--   DATABASE_URL=postgresql://kanchuki_app.<PROJECT_REF>:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--
-- Railway (production):
--   DATABASE_URL=postgresql://kanchuki_app.<PROJECT_REF>:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--   DATABASE_URL_MIGRATOR=postgresql://kanchuki_migrator.<PROJECT_REF>:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--     (DATABASE_URL_MIGRATOR only for the admin migration-trigger button — human-only)
--   PURGE_DATABASE_URL=postgresql://kanchuki_purge.<PROJECT_REF>:<PURGE_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--     (PURGE_DATABASE_URL read ONLY by the 30-day purge cron — never DATABASE_URL)
