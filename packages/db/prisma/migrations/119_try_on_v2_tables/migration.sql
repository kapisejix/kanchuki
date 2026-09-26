-- 119_try_on_v2_tables
--
-- F-039 Phase 2 tables (docs/tasks/pending/catvton-runpod-tryon-launch.md T1).
-- Runs AFTER 118, which adds the two enum values this file both uses and seeds —
-- keep that order (see 118's header for the 55P04 reasoning).
--
-- WHAT IS DELIBERATELY ABSENT
--
-- 1. No column for the input/wearer photo, on try_on_jobs or anywhere else.
--    The person's photo is never persisted (T6): the API sends it inline to the
--    RunPod worker as base64 and it dies with the request. `result_url` holds
--    the R2 KEY of the generated image only, served presigned per read — it is
--    a photo of a real person, so it follows the product-photo rule rather than
--    a public URL.
--
-- 2. No Row Level Security. The zero-policy RLS pattern is a Supabase-era
--    vestige; tables added since the Railway move ship without it and rely on
--    app-layer tenant scoping (Prisma `where retailer_id = self`) through the
--    privileged app role. Migration 099's header records the call in full, and
--    111's zero-policy pattern actively breaks the pooled Prisma read path.
--    (The old, dropped try_on_jobs DID have RLS — migrations 003/010/016 — but
--    that table is gone and this is not a revival of it: those policies named
--    `authenticated`/`anon`, roles the backend does not use.)
--
-- 3. No purge-role DELETE grant and no sweep in either purge job. try_on_jobs
--    carries a real FK to retailers with ON DELETE CASCADE, so a retailer purge
--    removes its jobs through the constraint. `purge-soft-deleted.test.ts` only
--    demands an explicit sweep for tables with a BARE `retailer_id` and no FK —
--    this is not one, and adding it to the purge path would in turn demand an
--    entry in migration 111 that is not wanted here (see 2).
--
-- GRANTS: none needed. ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql
-- §19.1) grants SELECT/INSERT/UPDATE on new tables to kanchuki_app, which covers
-- every operation these tables need — the usage-counter upsert included. DELETE
-- is not granted, and nothing hard-deletes these rows.

-- ─── CreateTable: try_on_jobs ────────────────────────────────────

CREATE TABLE "try_on_jobs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    -- null = the retailer generated it in-store; set = a passport-logged-in
    -- shopper generated it from the customer web product page. Only a set value
    -- counts against the customer-side quota.
    "customer_account_id" TEXT,
    "product_id" TEXT NOT NULL,
    -- PENDING | COMPLETED | FAILED (plain TEXT: the teardown dropped the
    -- TryOnJobStatus enum, and minting a near-namesake to the deprecated TRY_ON
    -- values invites the wrong conclusion).
    "status" TEXT NOT NULL,
    "result_url" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "try_on_jobs_pkey" PRIMARY KEY ("id")
);

-- ─── CreateTable: customer_resource_limits ───────────────────────
-- Customer-side twin of plan_limits. Shoppers have no plan, so this is ONE
-- admin-editable number per resource rather than a per-tier matrix — the
-- owner's "3–5 a month" knob, live-editable, no redeploy.

CREATE TABLE "customer_resource_limits" (
    "id" TEXT NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "limit_per_period" INTEGER NOT NULL,
    "period" "QuotaPeriod" NOT NULL DEFAULT 'MONTH',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "customer_resource_limits_pkey" PRIMARY KEY ("id")
);

-- ─── CreateTable: customer_usage_counters ────────────────────────

CREATE TABLE "customer_usage_counters" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_usage_counters_pkey" PRIMARY KEY ("id")
);

-- ─── CreateIndex ────────────────────────────────────────────────

CREATE INDEX "try_on_jobs_retailer_id_created_at_idx" ON "try_on_jobs"("retailer_id", "created_at");
CREATE INDEX "try_on_jobs_customer_account_id_idx" ON "try_on_jobs"("customer_account_id");

-- Single-column @unique → the shape Prisma expects for the retail-side twin
-- (plan_limits uses @@unique([plan, resource_type]) instead; a customer has no
-- plan, so resource_type alone is the key).
CREATE UNIQUE INDEX "customer_resource_limits_resource_type_key" ON "customer_resource_limits"("resource_type");

CREATE UNIQUE INDEX "customer_usage_counters_customer_account_id_resource_type_period_start_key" ON "customer_usage_counters"("customer_account_id", "resource_type", "period_start");
CREATE INDEX "customer_usage_counters_customer_account_id_idx" ON "customer_usage_counters"("customer_account_id");

-- ─── AddForeignKey ──────────────────────────────────────────────
-- SET NULL on the customer FK, not CASCADE: deleting a shopper must not delete
-- the retailer's generation history — the job stays, its customer link is lost.
ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_usage_counters" ADD CONSTRAINT "customer_usage_counters_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Seed: the two limit rows ───────────────────────────────────
--
-- Starting numbers, not policy — both are admin-editable live (Plan Limits for
-- the per-plan rows, T5's customer-limit field for the single customer row).
-- ON CONFLICT DO NOTHING, deliberately, where the sibling seed script
-- (seed-plan-limits.ts) upserts: this resource exists to be tuned by an admin at
-- runtime, and a re-run of a destructive-upsert seed would silently reset those
-- edits. Re-seeding a fresh local DB is the script's job; guaranteeing a
-- non-fail-open starting state in every environment is this migration's.
--
-- Why a starting row matters at all: checkQuota()/checkCustomerQuota() fail OPEN
-- when no row exists (so an unconfigured resource is not a surprise outage). For
-- a metered GPU call that is the wrong default — an unseeded TRY_ON_GENERATION
-- would mean unlimited real-money generations. So the rows ship with the schema.
--
-- Pro's 100/mo is the owner's own example number; Starter 20 / Growth 50 are the
-- spec's starting points.

INSERT INTO "plan_limits" ("id", "plan", "resource_type", "limit_per_period", "period", "created_at", "updated_at")
VALUES
  ('plt_tryon_starter', 'STARTER', 'TRY_ON_GENERATION',  20, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_tryon_growth',  'GROWTH',  'TRY_ON_GENERATION',  50, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plt_tryon_pro',     'PRO',     'TRY_ON_GENERATION', 100, 'MONTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("plan", "resource_type") DO NOTHING;

INSERT INTO "customer_resource_limits" ("id", "resource_type", "limit_per_period", "period", "updated_at")
VALUES ('crl_tryon_generation', 'TRY_ON_GENERATION', 3, 'MONTH', CURRENT_TIMESTAMP)
ON CONFLICT ("resource_type") DO NOTHING;
