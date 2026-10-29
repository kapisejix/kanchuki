-- 141: Google Business Profile — link + synced reviews
-- (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part B). Requires 140.
--
-- gbp_links    one row per retailer: the consent to be linked, and — once the Kanchuki
--              marketing team picks the retailer's location from the shared Google
--              identity's list — which Google account/location it is. Retailers can never
--              set gbp_account_id / gbp_location_id (only admin routes do).
-- gbp_reviews  Google reviews synced for a LINKED location, plus our reply once Google
--              confirmed it. Reviewer names are Google-public display names; rows are
--              hidden on unlink and purged 30 days later (DELETE goes to kanchuki_purge only).
--
-- ADDITIVE ONLY: new enum, two new tables. Nothing existing is altered.
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- kanchuki_app SELECT/INSERT/UPDATE on new tables. The app role gets NO DELETE (RC-049);
-- kanchuki_purge gets DELETE on gbp_reviews for the purge job. Both tables FK
-- retailers ON DELETE CASCADE, so retailer hard-delete needs no list entry (RC-050).
--
-- RLS: policy for the two backend roles first, then ENABLE, so there is never a window
-- where RLS is on and the API sees 0 rows (RC-030). Retailer scoping is enforced in
-- apps/api (every query carries retailer_id); RLS here denies anon/authenticated.
-- Idempotent: type, tables, indexes and constraints are guarded.
--
-- Rollback:
--   DROP TABLE IF EXISTS "gbp_reviews"; DROP TABLE IF EXISTS "gbp_links"; DROP TYPE IF EXISTS "GbpLinkStatus";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GbpLinkStatus') THEN
    CREATE TYPE "GbpLinkStatus" AS ENUM ('REQUESTED', 'LINKED', 'NEEDS_ACCESS', 'UNLINKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "gbp_links" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "status" "GbpLinkStatus" NOT NULL DEFAULT 'REQUESTED',
    "gbp_account_id" TEXT,
    "gbp_location_id" TEXT,
    "location_title" TEXT,
    "consented_at" TIMESTAMP(3) NOT NULL,
    "linked_by_team_member_id" TEXT,
    "linked_at" TIMESTAMP(3),
    "unlinked_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "avg_rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gbp_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gbp_links_linked_ids_chk" CHECK (
      "status" <> 'LINKED' OR ("gbp_account_id" IS NOT NULL AND "gbp_location_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "gbp_links_retailer_id_key" ON "gbp_links"("retailer_id");
-- a Google location can belong to ONE retailer (NULLs are distinct, so unlinked rows are fine)
CREATE UNIQUE INDEX IF NOT EXISTS "gbp_links_location_key"
  ON "gbp_links"("gbp_account_id", "gbp_location_id");
CREATE INDEX IF NOT EXISTS "gbp_links_status_idx" ON "gbp_links"("status");

CREATE TABLE IF NOT EXISTS "gbp_reviews" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "google_review_id" TEXT NOT NULL,
    "reviewer_name" TEXT,
    "star_rating" INTEGER NOT NULL,
    "comment" TEXT,
    "google_created_at" TIMESTAMP(3) NOT NULL,
    "google_updated_at" TIMESTAMP(3) NOT NULL,
    "reply_comment" TEXT,
    "reply_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gbp_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gbp_reviews_star_chk" CHECK ("star_rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "gbp_reviews_link_id_google_review_id_key"
  ON "gbp_reviews"("link_id", "google_review_id");
CREATE INDEX IF NOT EXISTS "gbp_reviews_retailer_id_google_created_at_idx"
  ON "gbp_reviews"("retailer_id", "google_created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gbp_links_retailer_id_fkey') THEN
    ALTER TABLE "gbp_links" ADD CONSTRAINT "gbp_links_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gbp_reviews_retailer_id_fkey') THEN
    ALTER TABLE "gbp_reviews" ADD CONSTRAINT "gbp_reviews_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gbp_reviews_link_id_fkey') THEN
    ALTER TABLE "gbp_reviews" ADD CONSTRAINT "gbp_reviews_link_id_fkey"
      FOREIGN KEY ("link_id") REFERENCES "gbp_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '141: kanchuki_app/kanchuki_purge missing — grants + RLS skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  GRANT DELETE ON "gbp_reviews" TO kanchuki_purge;

  FOREACH t IN ARRAY ARRAY['gbp_links', 'gbp_reviews'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t
        AND policyname = policy_name
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
        policy_name,
        t
      );
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
