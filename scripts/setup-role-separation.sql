-- ============================================================
-- F-017 Database Guardrails — Postgres Role Separation
-- ============================================================
-- Run this SQL in the Supabase SQL Editor (not via psql pooler).
-- These roles revoke DELETE/TRUNCATE/DROP from the app runtime.
--
-- Idempotent: safe to re-run against an existing setup (the roles were
-- first created 2026-07-26; re-running applies the sequence grants and
-- default-privileges fixes below without failing on CREATE ROLE).
--
-- Step 1: Open https://supabase.com/dashboard/projects
-- Step 2: Select your project (project ref = the `thpqcylmcxokajxoerjx`
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
    CREATE ROLE kanchuki_app WITH LOGIN PASSWORD 'KanchukiApp_R3stricted!';
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
    CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD 'KanchukiM1grator!2026' INHERIT;
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
    CREATE ROLE kanchuki_purge WITH LOGIN PASSWORD 'KanchukiPurge_Delete0nly!2026' INHERIT;
  END IF;
END
$$;
GRANT kanchuki_app TO kanchuki_purge;

-- Exactly the tables the purge cron hard-deletes (children before parents —
-- see the table list in purge-soft-deleted.ts). Tables added later need an
-- explicit GRANT DELETE here too; default privileges do NOT cover this role.
GRANT DELETE ON TABLE
  product_variants, product_photos, product_embeddings,
  products,
  collection_products, collection_views, collection_enquiries,
  collections,
  customer_interactions, customer_measurements, customer_fashion_dna,
  customers,
  staff, store_sections, product_categories, try_on_usage_logs, usage_counters,
  retailers
TO kanchuki_purge;

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
--   DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--
-- packages/db/.env:
--   DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--
-- Railway (production):
--   DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--   DATABASE_URL_MIGRATOR=postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:KanchukiM1grator!2026@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--     (DATABASE_URL_MIGRATOR only for the admin migration-trigger button — human-only)
--   PURGE_DATABASE_URL=postgresql://kanchuki_purge.thpqcylmcxokajxoerjx:KanchukiPurge_Delete0nly!2026@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--     (PURGE_DATABASE_URL read ONLY by the 30-day purge cron — never DATABASE_URL)
