-- 099: Staff invites (docs/tasks/staff-invite-tokens.md) — tokenized invite
-- system so a team member's first login is routed to the staff join, never to
-- /onboarding as a junk retailer.
--
-- StaffInvite: one live invite per staff row (staff_id unique, D5), carrying
-- only the sha256 hash of a single-use onboarding token (the raw token is
-- never stored). The token never authenticates — login stays phone + OTP; it
-- just tells POST /v1/auth/otp/verify "this phone is joining as staff".
--
-- RLS: intentionally NOT enabled — the codebase's RLS convention is a
-- Supabase-era vestige (staff / support_tickets, migrations 001/014); tables
-- added since the Railway move (069 design_references, 089-091, 093) ship
-- without RLS and rely on app-layer tenant scoping (Prisma where
-- retailer_id = self) through the privileged app role — migration 093's
-- header documents that the zero-policy pattern breaks the pooled Prisma
-- read path. The plan doc's "ENABLE ROW LEVEL SECURITY with zero policies"
-- line describes that stale pattern and is dropped deliberately, same call.
--
-- No F-017 hard-delete trigger: invites carry no legal-retention value, and
-- the main kanchuki_app role KEEPS DELETE on this table (unlike staff, where
-- migration 037/084 revoked DELETE and moved hard deletes to the purge role).
-- prisma.staffInvite.delete* works directly.
--
-- Backfill: every staff row with is_active = true AND auth_user_id IS NULL
-- (existing un-logged-in members) gets a pending invite expiring in 7 days.
-- The migration cannot hand the raw tokens to anyone — the retailer must hit
-- "Resend" (POST /v1/staff/:id/invite/resend, Phase 2) to mint a shareable
-- link for a backfilled invite. The placeholder hash is md5(random +
-- clock_timestamp + id): unique per row, unguessable, and never distributed
-- (the raw is never given out, and a real sha256 lookup can never match a
-- 32-char md5 hex). Phase 2's Resend replaces it with a real sha256 hash.

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_staff_id_key" ON "staff_invites"("staff_id");
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");
CREATE INDEX "staff_invites_retailer_id_idx" ON "staff_invites"("retailer_id");

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants. The app role's default privileges (setup-role-separation.sql §19.1)
-- cover SELECT/INSERT/UPDATE on new tables; DELETE is NOT in the default and
-- the spec keeps it on this table (unlike staff — no F-017 trigger, no DELETE
-- revocation): prisma.staffInvite.delete* works directly, no purge-role dance.
-- Same deliberate §19.1 narrowing as migrations 083 (product_photos) and 097
-- (showcase_designs).
GRANT DELETE ON "staff_invites" TO kanchuki_app;

-- The purge job (purge-retailer-now.ts / purge-soft-deleted.ts) deletes
-- explicitly by convention (belt-and-suspenders on top of the ON DELETE
-- CASCADE FKs) — same grant pattern as migration 084 for post-037 tables.
GRANT DELETE ON "staff_invites" TO kanchuki_purge;

-- Backfill pending invites for existing members who have never logged in.
-- Placeholder token_hash per the header comment; Resend replaces it with a
-- real shareable token. Same 7-day TTL as POST /v1/staff uses.
INSERT INTO "staff_invites" ("id", "staff_id", "retailer_id", "token_hash", "role_snapshot", "status", "expires_at", "created_at", "updated_at")
SELECT
  'inv_' || md5(random()::text || clock_timestamp()::text || s.id),
  s.id,
  s.retailer_id,
  md5(random()::text || clock_timestamp()::text || s.id || s.retailer_id),
  s.role,
  'pending',
  now() + interval '7 days',
  now(),
  now()
FROM "staff" s
WHERE s.is_active = true
  AND s.auth_user_id IS NULL;