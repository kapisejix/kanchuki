-- 111: Backend-role RLS policies for every table the purge path touches (RC-030).
--
-- ─── THE PROBLEM ──────────────────────────────────────────────────────────────
--
-- 50 tables in this schema have ROW LEVEL SECURITY enabled. Every policy on
-- every one of them targets `authenticated` or `anon` — the Supabase PostgREST
-- roles. NOT ONE names `kanchuki_app` or `kanchuki_purge`, the two roles the
-- backend actually connects as.
--
-- Postgres RLS is default-deny: a role that matches no permissive policy sees
-- zero rows. For SELECT/UPDATE/DELETE that is silent — the statement succeeds
-- and affects nothing — so a missing policy does not raise, log, or fail a
-- transaction. It just does nothing.
--
-- The backend nevertheless works today, which means it is bypassing RLS. It has
-- no `BYPASSRLS` attribute (nothing in this repo grants one), so the bypass is
-- `pg_class_ownercheck` succeeding through role membership: `kanchuki_purge` IS
-- `kanchuki_app` (`GRANT kanchuki_app TO kanchuki_purge`), so if the tables are
-- owned by `kanchuki_app`, both roles are treated as owners and skip RLS.
--
-- So the backend's access to all 50 tables rests on WHO HAPPENED TO OWN EACH
-- TABLE — an accident of which role ran which migration (base schema via
-- prisma; 083-089 via the admin runner on DATABASE_URL_MIGRATOR; others from dev
-- machines on the kanchuki_app-scoped .env). Nothing verifies it, nothing
-- documents it, and it is per-table. Where it does not hold, the operation
-- silently affects 0 rows.
--
-- RC-030 hit exactly this: the four `customer_*`/`consent_*` sweeps added to the
-- purge jobs could delete nothing and report success.
--
-- ─── WHY A POLICY AND NOT `ALTER ROLE ... BYPASSRLS` ─────────────────────────
--
-- `BYPASSRLS` needs superuser, so it can only be applied by hand in the SQL
-- Editor — it can never ride `prisma migrate deploy`. That is precisely the
-- RC-029 failure: a fix that lives only in a hand-run script and is therefore
-- never guaranteed to be applied. A policy is ordinary DDL that the same role
-- which enabled RLS on these tables can create.
--
-- A per-table policy also keeps the grant visible: BYPASSRLS would silently
-- cover future tables and leave no trace in the schema, which is how this class
-- of bug hides in the first place.
--
-- ─── WHY BOTH ROLES, AND WHY `FOR ALL` ───────────────────────────────────────
--
-- `kanchuki_app` is named because these rows have to exist before the sweeps can
-- find them: `products`, `customers`, `audit_logs` and the four `customer_*` /
-- `consent_*` tables are all written by the API role. If the ownership accident
-- does not hold for a table, the API's INSERT there raises 42501 — and on the
-- interaction beacon that error is swallowed (`passport-activity.ts` catches and
-- discards), so the feature looks fine while recording nothing.
--
-- `kanchuki_purge` is named because it is the role that deletes.
--
-- `FOR ALL` and not `FOR DELETE` is load-bearing, and this is the trap worth
-- recording. `purgeTable()` SELECTs a batch of ids first and breaks out of its
-- loop when the batch is empty, and `fetchR2Keys()` SELECTs the R2 keys before
-- the rows go, and `purgeChildren()` scopes its DELETE with
-- `retailer_id IN (SELECT id FROM retailers ...)`. Under a DELETE-only policy
-- every one of those SELECTs still returns 0 rows — so the delete would keep
-- silently doing nothing, now with a policy in place to make it look fixed.
-- SELECT has to be covered too.
--
-- `USING (true)` is correct here and is not a widening of anything: these
-- policies name only the two backend roles, they are PERMISSIVE (so they OR with
-- the existing `authenticated`/`anon` policies rather than replacing them), and
-- RLS is a filter — it cannot grant a privilege. `kanchuki_app` still cannot
-- DELETE anything, because `REVOKE DELETE` in scripts/setup-role-separation.sql
-- is a privilege check that runs before RLS is consulted. The `anon` /
-- `authenticated` isolation PostgREST depends on is untouched.
--
-- ─── SCOPE ───────────────────────────────────────────────────────────────────
--
-- The 24 tables below are the ones the purge path touches (the 22 it deletes
-- from plus `audit_logs`, which it writes). Derived from the job sources, not
-- typed by hand — `apps/api/src/jobs/purge-rls-policy.test.ts` re-derives the
-- set from schema.prisma + the migrations + both job files and fails if this
-- array and that set ever disagree in either direction, so a new RLS-enabled
-- table that the purge path touches cannot be added without appearing here.
--
-- The rest of the schema's RLS tables have the same latent dependency on the
-- ownership accident; they are out of scope here only because nothing in the
-- purge path touches them. See RC-030.
--
-- Idempotent: re-running skips a policy that already exists, and skips a table
-- that has since been dropped, so a teardown migration cannot break this one.

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
  tables constant text[] := ARRAY[
    -- The four RC-030 named as silently sweeping 0 rows.
    'consent_events',
    'customer_interactions',
    'customer_recently_viewed',
    'customer_wishlist_items',
    -- The other 18 RLS-enabled tables the two purge jobs DELETE from. Listed
    -- because they are indistinguishable from the four above: same roles, same
    -- absence of a backend policy, same silent-0-rows failure mode if the
    -- ownership accident does not hold for them.
    'ai_usage_logs',
    'collection_enquiries',
    'collection_products',
    'collection_views',
    'collections',
    'customers',
    'product_categories',
    'product_embeddings',
    'product_photos',
    'product_variants',
    'products',
    'quota_addon_purchases',
    -- Also read by purgeChildren()'s subquery and by purgeTable(), so the
    -- delete of every child row depends on this role seeing these rows.
    'retailers',
    'staff',
    'store_sections',
    'subscription_payments',
    'subscriptions',
    'support_tickets',
    'usage_counters',
    -- Written by the purge cron (db.auditLog.create) but never deleted. Its RLS
    -- is deliberate deny-all for PostgREST (migration 016), which is unchanged
    -- by naming the backend roles.
    'audit_logs'
  ];
  t text;
BEGIN
  -- A brand-new environment applies migrations before the hand-run F-017 role
  -- script exists, and CREATE POLICY naming a nonexistent role is a hard error
  -- that would abort `prisma migrate deploy`. Warn rather than fail — and the
  -- warning is not swallowed: purge-rls-policy.test.ts asserts
  -- scripts/setup-role-separation.sql still creates both roles, so this branch
  -- cannot quietly become the normal one.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING
      '111: kanchuki_app/kanchuki_purge missing — skipping backend RLS policies. Run scripts/setup-role-separation.sql first, then re-apply. Until then the purge sweeps on RLS tables will affect 0 rows silently (RC-030).';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    -- A table dropped by a later teardown must not abort the migration.
    IF to_regclass(t) IS NULL THEN
      RAISE WARNING '111: table % does not exist — skipped', t;
      CONTINUE;
    END IF;

    -- Scoped to the search_path, which is the SAME resolution `to_regclass(t)`
    -- above and the unqualified `CREATE POLICY` below both use. Without this
    -- clause a policy of this name on a same-named table in another schema
    -- (auth/storage) would make the loop skip, and the migration would silently
    -- do nothing — this class's own failure mode, in its own guard.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t
        AND policyname = policy_name
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      CONTINUE;
    END IF;

    -- NOTE: the DDL below is extracted verbatim by purge-rls-live.test.ts and
    -- executed against scratch tables, so the opt-in live test proves the same
    -- statement this migration runs — not a copy of it that can drift.
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      t
    );
  END LOOP;
END $$;
