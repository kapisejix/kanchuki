-- 089_resource_packs
-- F-034 task 6.1: ADMIN-MANAGED addon packs, DB-backed. The admin adds / approves /
-- assigns packs per plan from the dashboard — no hardcoded pack values in code
-- (the old ADDON_PRICING const is NOT extended; the purchase rail switches to this
-- table in F-034 Phase 2 task 6.1 once the AI_VIDEO enum value ships in migration 090).
--
-- resource_type is TEXT (not the QuotaResourceType enum) on purpose: the admin may
-- configure packs for a brand-new resource (e.g. AI_VIDEO) BEFORE its enum value
-- exists, without another enum-ADD migration. Values are validated app-side against
-- the known metered-resource list.

CREATE TABLE "resource_packs" (
    "id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit_label" TEXT NOT NULL,
    "pack_size" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "plans" TEXT[] NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_packs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resource_packs_resource_type_idx" ON "resource_packs"("resource_type");
