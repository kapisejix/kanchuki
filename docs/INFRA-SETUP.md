# Infrastructure Setup Guide — Vault DB & Role Separation

**Date:** July 26, 2026 (updated after actual execution)  
**Scope:** F-016 (Deletion Vault) + F-017 (DB Guardrails)

> ✅ **Both items completed 2026-07-26.** This guide now documents what was done and the remaining manual steps.
>
> **Completed:** Vault DB provisioned on Railway Postgres-PYkI (`sakura.proxy.rlwy.net:23505`) with INSERT-only `vault_app` role. `kanchuki_app` and `kanchuki_migrator` roles created on Supabase. `VAULT_DATABASE_URL` and `DATABASE_URL` updated in Railway env vars. Vault Prisma client generated. Vault permission test passes.
>
> **Still manual:** Migration 037 guardrail triggers not yet applied (needs Supabase SQL Editor — PgBouncer blocks CLI direct connect). Local `.env` files still reference superuser credentials — update to `kanchuki_app` manually.

---

## Item 1: Provision the Vault Postgres Instance (F-016)

The Deletion Vault needs its own Postgres database — a separate instance from your primary Supabase DB.

> ✅ **Completed:** Used existing Railway Postgres-PYkI instance (`sakura.proxy.rlwy.net:23505`).

### Step 1: Create a Railway Postgres

1. Open [Railway Dashboard](https://railway.app/dashboard)
2. Click **New Project** → **Provision PostgreSQL**
3. Name it `kanchuki-vault-db`
4. Wait for provisioning (30–60 seconds)
5. Railway will show the connection string — it looks like:
   ```
   postgresql://postgres:password@host:5432/railway
   ```
6. **Copy this connection string** — you'll need it below

### Step 2: Connect and Create the INSERT-only Role

**Option A — Railway CLI** (recommended if you have it installed):
```bash
railway connect kanchuki-vault-db
# This opens a tunnel to localhost:PORT
# Then in another terminal:
psql postgresql://postgres:password@localhost:PORT/railway
```

**Option B — psql directly** (if Railway exposes the endpoint):
```bash
psql "postgresql://postgres:password@host:5432/railway"
```

Once connected, run:

```sql
CREATE ROLE vault_app WITH LOGIN PASSWORD '<VAULT_PASSWORD>';
GRANT CONNECT ON DATABASE "railway" TO vault_app;
GRANT USAGE ON SCHEMA public TO vault_app;

CREATE TABLE IF NOT EXISTS deleted_records (
  id            TEXT PRIMARY KEY,
  source_table  TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  retailer_id   TEXT,
  payload       JSONB NOT NULL,
  delete_reason TEXT,
  deleted_by    TEXT,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_source
  ON deleted_records (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_retailer
  ON deleted_records (retailer_id);

GRANT INSERT ON deleted_records TO vault_app;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON deleted_records FROM vault_app;
```

**Verify** (all should pass):
```sql
SELECT has_table_privilege('vault_app', 'deleted_records', 'INSERT'); -- → true
SELECT has_table_privilege('vault_app', 'deleted_records', 'SELECT');  -- → false
SELECT has_table_privilege('vault_app', 'deleted_records', 'UPDATE');  -- → false
SELECT has_table_privilege('vault_app', 'deleted_records', 'DELETE');  -- → false
```

### Step 3: Set VAULT_DATABASE_URL

**Locally** — add to `apps/api/.env` and `packages/db/.env`:
```bash
VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
```

**Railway (production)** — add to the API service's environment variables:
| Variable | Value |
|----------|-------|
| `VAULT_DATABASE_URL` | `postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway` |

> **Note:** Use the `vault_app` credentials (INSERT-only), not the Railway default superuser.

### Step 4: Generate the Vault Prisma Client

```bash
cd E:/Kanchuki/packages/db
set VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
npx prisma generate --schema=prisma/vault-schema.prisma
```

This creates the vault client at `packages/db/src/generated/vault/`.

### Step 5: Run the Vault Permission Test

```bash
cd E:/Kanchuki/packages/db
set VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
npx vitest run src/vault.test.ts --reporter=verbose
```

Expected output:
```
✓ vault INSERT-only constraint
  ✓ UPDATE is rejected with a database permission error
  ✓ DELETE is rejected with a database permission error
```

### Step 6: Deploy & Restart

After setting `VAULT_DATABASE_URL` in Railway, Railway will auto-restart the API service. The vault writes are now active — every soft-delete (product, customer, collection, retailer) writes a full-payload snapshot to the vault DB.

---

## Item 2: Run Role-Separation SQL (F-017)

This creates `kanchuki_app` (restricted, no DELETE) and `kanchuki_migrator` (full privileges, human-only) roles in your Supabase project.

### Step 1: Open Supabase SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/projects)
2. Select your project (`thpqcylmcxokajxoerjx` — the project ref, i.e. the suffix in the pooler URLs below; confirm on the dashboard's **Connect** tab if unsure)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Paste and Run the SQL

Open `scripts/setup-role-separation.sql` and paste into the SQL Editor, OR copy directly:

> The canonical, idempotent version lives in **`scripts/setup-role-separation.sql`** — paste that file into the SQL Editor. It is safe to re-run over the existing setup (the 2026-07-26 roles already exist; re-running applies the sequence grants). Equivalent inline:

```sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app') THEN CREATE ROLE kanchuki_app WITH LOGIN PASSWORD '<APP_PASSWORD>'; END IF; END $$;
GRANT CONNECT ON DATABASE postgres TO kanchuki_app;
GRANT USAGE ON SCHEMA public TO kanchuki_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kanchuki_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO kanchuki_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kanchuki_app;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_migrator') THEN CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD>' INHERIT; END IF; END $$;
GRANT kanchuki_app TO kanchuki_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kanchuki_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kanchuki_migrator;

-- Third role: the 30-day purge cron (narrow-scoped DELETE, no DDL).
-- The cron cannot use kanchuki_app (DELETE revoked) or kanchuki_migrator
-- (human-only) — this is the sanctioned middle ground.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN CREATE ROLE kanchuki_purge WITH LOGIN PASSWORD '<PURGE_PASSWORD>' INHERIT; END IF; END $$;
GRANT kanchuki_app TO kanchuki_purge;
GRANT DELETE ON TABLE products, product_variants, product_photos, product_embeddings, collections, collection_products, collection_views, collection_enquiries, customers, customer_interactions, customer_measurements, customer_fashion_dna, retailers, staff, store_sections, product_categories, try_on_usage_logs, usage_counters TO kanchuki_purge;
```

**Verify:**
```sql
SELECT rolname, rolsuper FROM pg_roles WHERE rolname LIKE 'kanchuki_%';
-- Should show 3 rows — kanchuki_app, kanchuki_migrator, kanchuki_purge

SELECT has_table_privilege('kanchuki_app', 'products', 'DELETE'); -- → false
SELECT has_table_privilege('kanchuki_migrator', 'products', 'DELETE'); -- → true
SELECT has_table_privilege('kanchuki_purge', 'products', 'DELETE'); -- → true (purge role only)
SELECT has_table_privilege('kanchuki_purge', 'products', 'TRUNCATE'); -- → false (no DDL)
```

### Step 3: Update DATABASE_URL

> ⚠️ **Pooler usernames include the project ref.** Supabase's pooler rejects the
> bare `kanchuki_app` username with `password authentication failed` — the
> username must be `<role>.<project_ref>`, e.g. `kanchuki_app.thpqcylmcxokajxoerjx`.
> Substitute your project's ref if it differs.

**Locally** — update `apps/api/.env`:
```
# BEFORE:
DATABASE_URL=postgresql://postgres.thpqcylmcxokajxoerjx:<SUPERUSER_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# AFTER:
DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Also update `packages/db/.env` (direct connection, no pooler):
```
# BEFORE:
DATABASE_URL=postgresql://postgres.thpqcylmcxokajxoerjx:<SUPERUSER_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# AFTER:
DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
```

**Railway (production)** — update the `DATABASE_URL` env var on the API service:
| Variable | New Value |
|----------|-----------|
| `DATABASE_URL` | `postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |

**Optional** — add a migrator URL (only used by the admin migration-trigger button):
| Variable | Value |
|----------|-------|
| `DATABASE_URL_MIGRATOR` | `postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |

> ⚠️ `DATABASE_URL_MIGRATOR` should NOT be set as a regular env var — only provide it when the admin needs to trigger a migration, or use it interactively via `prisma migrate deploy`.

**Purge cron** — add a scoped purge URL (read ONLY by the 30-day purge cron in `apps/api/src/jobs/purge-soft-deleted.ts`, never by request traffic):
| Variable | Value |
|----------|-------|
| `PURGE_DATABASE_URL` | `postgresql://kanchuki_purge.thpqcylmcxokajxoerjx:<PURGE_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |

> Without `PURGE_DATABASE_URL` the purge cron falls back to the main client and fails nightly with `permission denied` (kanchuki_app has no DELETE). The `kanchuki_purge` role is created by the Step 2 SQL above.

### Step 4: Apply Migration 037 (Guardrail Triggers)

Now that the restricted roles exist, apply the BEFORE DELETE triggers:

```bash
cd E:/Kanchuki/packages/db
# Use the MIGRATOR URL (kanchuki_app can't run DDL)
set DATABASE_URL=postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
npx prisma migrate deploy
```

### Step 5: Verify Everything Works

Test that a DELETE is blocked via the API connection:
```bash
# This should FAIL — kanchuki_app has no DELETE privilege
psql "postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: permission denied for table products
```

Test that the guardrail trigger also blocks:
```bash
# Even through the migrator role, the trigger blocks without session flag
psql "postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: Hard delete blocked by guardrail trigger on products (F-017)

# The purge role has DELETE but is still blocked by the trigger without the flag
psql "postgresql://kanchuki_purge.thpqcylmcxokajxoerjx:<PURGE_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: Hard delete blocked by guardrail trigger on products (F-017)
# (The purge cron sets SET app.allow_hard_delete = 'true' itself inside each tx.)
```

---

## The Guardrail Layers After Setup

```
Layer 4 ─ Deletion Vault ── Separate DB, INSERT-only, independent backup
Layer 3 ─ CI grep guard ─── scripts/check-delete-guard.sh (already active)
Layer 2 ─ DB triggers ───── prevent_hard_delete() on 8 business tables
Layer 1 ─ Role separation ── kanchuki_app can't DELETE/DROP/TRUNCATE
```

After both items are complete, run the CI guard to confirm nothing is broken:
```bash
cd E:/Kanchuki
bash scripts/check-delete-guard.sh
# Expected: PASSED
```

Then restart the API to use the new restricted role, and verify the admin dashboard's `/admin/database/status` page shows green health checks for guardrails.
