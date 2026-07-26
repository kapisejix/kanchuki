-- ============================================================
-- F-017 Database Guardrails — Postgres Role Separation
-- ============================================================
-- Run this SQL in the Supabase SQL Editor (not via psql pooler).
-- These roles revoke DELETE/TRUNCATE/DROP from the app runtime.
--
-- Step 1: Open https://supabase.com/dashboard/projects
-- Step 2: Select your project
-- Step 3: Open SQL Editor
-- Step 4: Paste and run this entire file
-- Step 5: Verify with the SELECT at the bottom
-- Step 6: Update .env DATABASE_URL to use kanchuki_app credentials
-- ============================================================

-- ─── 1. Create the APPLICATION role ───────────────────────────
-- Used by DATABASE_URL for ALL runtime API/worker operations.
-- CANNOT delete, truncate, drop, alter, or create anything.
CREATE ROLE kanchuki_app WITH LOGIN PASSWORD 'KanchukiApp_R3stricted!';
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

-- ─── 2. Create the MIGRATOR role ─────────────────────────────
-- FULL privileges — for schema migrations and the 30-day purge cron.
-- NEVER put this in .env. Human-only via prisma migrate deploy.
CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD 'KanchukiM1grator!2026' INHERIT;

-- Inherits kanchuki_app's SELECT/INSERT/UPDATE, then adds full DDL
GRANT kanchuki_app TO kanchuki_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kanchuki_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO kanchuki_migrator;

-- ─── 3. Verify ───────────────────────────────────────────────
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname LIKE 'kanchuki_%';
-- Expected: 2 rows — kanchuki_app and kanchuki_migrator

-- Verify kanchuki_app cannot delete:
SELECT has_table_privilege('kanchuki_app', 'products', 'DELETE');
-- Expected: false

-- Verify kanchuki_migrator CAN delete (has full privileges via inheritance):
SELECT has_table_privilege('kanchuki_migrator', 'products', 'DELETE');
-- Expected: true

-- ============================================================
-- AFTER running this SQL, update your .env files:
-- ============================================================
-- .env (root):
--   DATABASE_URL=postgresql://kanchuki_app:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--
-- packages/db/.env:
--   DATABASE_URL=postgresql://kanchuki_app:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
--
-- Railway (production):
--   DATABASE_URL=postgresql://kanchuki_app:KanchukiApp_R3stricted!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--   (Add DATABASE_URL_MIGRATOR for the admin migration trigger button)
