-- Shopper Passport core tables (customer-qr-identity-solution.md §7).
-- Adds global customer identity, per-store visit tracking, consent audit,
-- passport sessions, recently-viewed, wishlist, and store affinities.

-- ─── Enum additions ───────────────────────────────────────────────

ALTER TYPE "CustomerLeadSource" ADD VALUE IF NOT EXISTS 'WHATSAPP_LINK';
ALTER TYPE "CustomerLeadSource" ADD VALUE IF NOT EXISTS 'DIRECT_WEB';

-- ─── Existing-table changes ───────────────────────────────────────

-- Link per-retailer Customer rows to the global CustomerAccount
ALTER TABLE "customers" ADD COLUMN "customer_account_id" TEXT;

-- Link CustomerFashionDNA to identity scope (Task 15 adds the column;
-- Prisma schema already has it — safe to add here as nullable)
ALTER TABLE "customer_fashion_dna" ADD COLUMN "customer_account_id" TEXT;

-- Link CustomerInteraction to identity scope (Task 11 will widen usage)
ALTER TABLE "customer_interactions" ADD COLUMN "customer_account_id" TEXT;

-- ─── New tables ───────────────────────────────────────────────────

-- Global shopper identity, sits above per-retailer Customer rows.
-- Cookie-based session (Task 3), not Supabase Auth.
CREATE TABLE "customer_accounts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "name" TEXT,
    "gender" "Gender",
    "city" TEXT,
    "state" TEXT,
    "usual_size" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- Unique + index constraints
CREATE UNIQUE INDEX "customer_accounts_phone_key" ON "customer_accounts"("phone");
CREATE UNIQUE INDEX "customer_accounts_phone_hash_key" ON "customer_accounts"("phone_hash");

-- FK indexes for customers → customer_accounts
CREATE INDEX "customers_customer_account_id_idx" ON "customers"("customer_account_id");
CREATE INDEX "customer_fashion_dna_customer_account_id_idx" ON "customer_fashion_dna"("customer_account_id");
CREATE UNIQUE INDEX "customer_fashion_dna_customer_account_id_key" ON "customer_fashion_dna"("customer_account_id");
CREATE INDEX "customer_interactions_customer_account_id_idx" ON "customer_interactions"("customer_account_id");

-- One row per (shopper, retailer). Tracks scan + per-store consent state.
CREATE TABLE "customer_store_visits" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "source" "CustomerLeadSource" NOT NULL DEFAULT 'QR_SCAN',
    "first_visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit_count" INTEGER NOT NULL DEFAULT 1,
    "contact_shared" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_consent" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_consent_at" TIMESTAMP(3),
    "is_muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_store_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_store_visits_customer_account_id_retailer_id_key" ON "customer_store_visits"("customer_account_id", "retailer_id");
CREATE INDEX "customer_store_visits_retailer_id_last_visited_at_idx" ON "customer_store_visits"("retailer_id", "last_visited_at");

-- Append-only consent/withdrawal audit (DPDP record-keeping).
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "retailer_id" TEXT,
    "kind" TEXT NOT NULL,
    "notice_version" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_events_customer_account_id_created_at_idx" ON "consent_events"("customer_account_id", "created_at");

-- Passport session (DB row + Redis cache, Task 3).
CREATE TABLE "passport_sessions" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_hash" TEXT,

    CONSTRAINT "passport_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "passport_sessions_customer_account_id_idx" ON "passport_sessions"("customer_account_id");

-- Identity-scoped recently-viewed (replaces localStorage same-store tracker).
CREATE TABLE "customer_recently_viewed" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_recently_viewed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_recently_viewed_customer_account_id_product_id_key" ON "customer_recently_viewed"("customer_account_id", "product_id");
CREATE INDEX "customer_recently_viewed_customer_account_id_viewed_at_idx" ON "customer_recently_viewed"("customer_account_id", "viewed_at");

-- Identity-scoped cross-store favorites (delivers deferred item 22).
CREATE TABLE "customer_wishlist_items" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_wishlist_items_customer_account_id_product_id_key" ON "customer_wishlist_items"("customer_account_id", "product_id");
CREATE INDEX "customer_wishlist_items_customer_account_id_idx" ON "customer_wishlist_items"("customer_account_id");

-- Nightly precomputed store-discovery score per shopper (§16.4).
CREATE TABLE "store_affinities" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_affinities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_affinities_customer_account_id_retailer_id_key" ON "store_affinities"("customer_account_id", "retailer_id");
CREATE INDEX "store_affinities_customer_account_id_score_idx" ON "store_affinities"("customer_account_id", "score");

-- ─── Foreign keys ─────────────────────────────────────────────────

ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_fashion_dna" ADD CONSTRAINT "customer_fashion_dna_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_store_visits" ADD CONSTRAINT "customer_store_visits_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_store_visits" ADD CONSTRAINT "customer_store_visits_retailer_id_fkey"
    FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passport_sessions" ADD CONSTRAINT "passport_sessions_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_recently_viewed" ADD CONSTRAINT "customer_recently_viewed_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_affinities" ADD CONSTRAINT "store_affinities_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Row Level Security ──────────────────────────────────────────
-- Passport PII tables: retailer role sees only its own retailer_id rows
-- in customer_store_visits, and only where contact_shared = true.
-- customer_accounts is Kanchuki-only (no retailer access via RLS).
-- consent_events is append-only audit (no retailer access via RLS).

ALTER TABLE "customer_accounts" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny for all roles (Kanchuki API uses service_role)

ALTER TABLE "customer_store_visits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retailer_own_store_visits" ON "customer_store_visits"
  FOR SELECT TO authenticated
  USING (
    retailer_id IN (
      SELECT id FROM retailers WHERE auth_user_id = (SELECT auth.uid())::text
    )
    AND contact_shared = true
  );

ALTER TABLE "consent_events" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny (consent audit is Kanchuki-only)

ALTER TABLE "passport_sessions" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny (sessions are Kanchuki-only)

ALTER TABLE "customer_recently_viewed" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny (identity-scoped, Kanchuki-only)

ALTER TABLE "customer_wishlist_items" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny (identity-scoped, Kanchuki-only)

ALTER TABLE "store_affinities" ENABLE ROW LEVEL SECURITY;
-- No policies = default deny (identity-scoped, Kanchuki-only)
