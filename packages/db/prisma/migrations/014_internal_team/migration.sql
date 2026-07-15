-- Migration: internal_team
-- Internal team management (docs/PRO-REQUIREMENTS.md Section 10): staff
-- roles, territory hierarchy, retailer attribution, support tickets.
-- Uses DO blocks / IF NOT EXISTS for idempotency, matching repo convention.

-- ─── Enums ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamRole') THEN
    CREATE TYPE "TeamRole" AS ENUM ('SUPER_ADMIN', 'MARKETING_MANAGER', 'MARKETING_AGENT', 'SUPPORT_MANAGER', 'SUPPORT_AGENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TerritoryLevel') THEN
    CREATE TYPE "TerritoryLevel" AS ENUM ('STATE', 'CITY', 'ZONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketStatus') THEN
    CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED');
  END IF;
END $$;

-- ─── territories (self-referencing hierarchy: ZONE -> CITY -> STATE) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'territories') THEN
    CREATE TABLE "territories" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "level" "TerritoryLevel" NOT NULL,
      "parent_id" TEXT,
      "pincodes" TEXT[] NOT NULL DEFAULT '{}',

      CONSTRAINT "territories_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "territories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "territories"("id")
    );
    CREATE INDEX "territories_parent_id_idx" ON "territories"("parent_id");
  END IF;
END $$;

-- ─── team_members ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_members') THEN
    CREATE TABLE "team_members" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "password_hash" TEXT NOT NULL,
      "role" "TeamRole" NOT NULL,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "max_retailers" INTEGER,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");
    CREATE INDEX "team_members_email_idx" ON "team_members"("email");
  END IF;
END $$;

-- ─── team_member_territories (many-to-many staff <-> territory) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_member_territories') THEN
    CREATE TABLE "team_member_territories" (
      "id" TEXT NOT NULL,
      "team_member_id" TEXT NOT NULL,
      "territory_id" TEXT NOT NULL,
      "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "team_member_territories_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "team_member_territories_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id"),
      CONSTRAINT "team_member_territories_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id")
    );
    CREATE UNIQUE INDEX "team_member_territories_team_member_id_territory_id_key" ON "team_member_territories"("team_member_id", "territory_id");
    CREATE INDEX "team_member_territories_territory_id_idx" ON "team_member_territories"("territory_id");
  END IF;
END $$;

-- ─── retailers: attribution columns ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retailers' AND column_name = 'territory_id'
  ) THEN
    ALTER TABLE "retailers" ADD COLUMN "territory_id" TEXT;
    ALTER TABLE "retailers" ADD COLUMN "onboarded_by_id" TEXT;
    ALTER TABLE "retailers" ADD COLUMN "support_owner_id" TEXT;
    ALTER TABLE "retailers" ADD CONSTRAINT "retailers_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id");
    ALTER TABLE "retailers" ADD CONSTRAINT "retailers_onboarded_by_id_fkey" FOREIGN KEY ("onboarded_by_id") REFERENCES "team_members"("id");
    ALTER TABLE "retailers" ADD CONSTRAINT "retailers_support_owner_id_fkey" FOREIGN KEY ("support_owner_id") REFERENCES "team_members"("id");
    CREATE INDEX "retailers_territory_id_idx" ON "retailers"("territory_id");
  END IF;
END $$;

-- ─── support_tickets ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets') THEN
    CREATE TABLE "support_tickets" (
      "id" TEXT NOT NULL,
      "retailer_id" TEXT NOT NULL,
      "requires_visit" BOOLEAN NOT NULL DEFAULT false,
      "region_scope_id" TEXT,
      "assigned_to_id" TEXT,
      "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
      "note" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolved_at" TIMESTAMP(3),

      CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "support_tickets_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id"),
      CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "team_members"("id")
    );
    CREATE INDEX "support_tickets_retailer_id_idx" ON "support_tickets"("retailer_id");
    CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────
-- Internal team tables hold no retailer_id-scoped tenant data of their own
-- (team_members/territories are Kanchuki-internal; support_tickets carries
-- retailer_id but is read/written only by the API's service-role key, same
-- pattern as try_on_usage_logs). Team access control is enforced at the API
-- layer (a TeamMember's session carries their assigned territory_ids; every
-- retailer-list/detail query filters by retailer.territory_id IN (...), Super
-- Admin bypasses) — see docs/DATABASE.md. RLS enabled with zero policies
-- (default-deny for anon/authenticated) as defense in depth.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'team_members') THEN
    ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'territories') THEN
    ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'team_member_territories') THEN
    ALTER TABLE "team_member_territories" ENABLE ROW LEVEL SECURITY;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'support_tickets') THEN
    ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
