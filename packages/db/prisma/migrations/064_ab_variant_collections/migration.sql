-- Roadmap S — A/B Testing: auto-built per-variant collection links.
-- Adds HIDDEN status for A/B variant collections (direct-link only, excluded
-- from public storefront listing) and FK columns on Campaign to track which
-- collections hold each variant's product set.

-- Add HIDDEN to CollectionStatus enum.
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be
-- USED in the same transaction. Since we only ADD the value here (no
-- INSERT/UPDATE referencing it), this is safe in a single migration.
ALTER TYPE "CollectionStatus" ADD VALUE 'HIDDEN';

-- Add variant collection FK columns to campaigns table.
ALTER TABLE "campaigns"
ADD COLUMN "variant_a_collection_id" TEXT,
ADD COLUMN "variant_b_collection_id" TEXT,
ADD COLUMN "cleanup_ttl_days" INTEGER;
