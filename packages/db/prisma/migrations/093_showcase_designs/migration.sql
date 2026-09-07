-- 093: Suits Designs (docs/tasks/suits-designs.md) — schema + category seeds.
--
-- ShowcaseDesignCategory (admin-global, dynamic) + ShowcaseDesign. Retailer
-- rows (retailer_id NOT NULL) and admin-global rows (NULL) share one table;
-- the self-M2M "_RelatedShowcaseCategories" join is what makes "a Saree
-- product also shows Blouse designs" work, admin-edited, zero code maps.
--
-- RLS: intentionally NOT enabled — the codebase's RLS convention is deny-all
-- on admin-catalog tables only (migrations 020/027/035/050, Supabase-era);
-- tables added since the Railway move (069 design_references, 089, 090, 091)
-- ship without RLS and rely on app-layer tenant scoping (Prisma where
-- retailer_id = self / IS NULL) through the privileged app role. The plan
-- doc's original per-row `kanchuki.retailer_id` policy text describes a GUC
-- that does not exist in this codebase (verified: no migration or code sets
-- it) and would break the pooled Prisma read path — dropped deliberately.
--
-- PlanFeature / plan_limits rows referencing the new SHOWCASE_DESIGNS enum
-- value live in 094 (enum add alone) + 095 (rows) — a fresh enum value
-- cannot be used in the same transaction that added it (Postgres 55P04; the
-- 056/057 and 060/061/062 splits). 093 itself references no new enum value.

-- CreateTable
CREATE TABLE "showcase_design_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showcase_design_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_designs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT,
    "category_id" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "name" TEXT,
    "image_url" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "original_r2_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showcase_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable (implicit self-M2M join — Prisma relation "RelatedShowcaseCategories")
CREATE TABLE "_RelatedShowcaseCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "showcase_design_categories_name_key" ON "showcase_design_categories"("name");
CREATE UNIQUE INDEX "showcase_design_categories_slug_key" ON "showcase_design_categories"("slug");

-- CreateIndex
CREATE INDEX "showcase_designs_retailer_id_idx" ON "showcase_designs"("retailer_id");
CREATE INDEX "showcase_designs_category_slug_is_active_idx" ON "showcase_designs"("category_slug", "is_active");
CREATE INDEX "showcase_designs_retailer_id_category_slug_is_active_idx" ON "showcase_designs"("retailer_id", "category_slug", "is_active");

-- CreateIndex (join table)
CREATE UNIQUE INDEX "_RelatedShowcaseCategories_AB_unique" ON "_RelatedShowcaseCategories"("A", "B");
CREATE INDEX "_RelatedShowcaseCategories_B_index" ON "_RelatedShowcaseCategories"("B");

-- AddForeignKey
ALTER TABLE "showcase_designs" ADD CONSTRAINT "showcase_designs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_designs" ADD CONSTRAINT "showcase_designs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "showcase_design_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (join table → categories)
ALTER TABLE "_RelatedShowcaseCategories" ADD CONSTRAINT "_RelatedShowcaseCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "showcase_design_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_RelatedShowcaseCategories" ADD CONSTRAINT "_RelatedShowcaseCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "showcase_design_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seed the 6 initial categories (plan §9) — admin owns them from here on.
-- Fixed ids so the self-M2M links below can reference them.
INSERT INTO "showcase_design_categories" ("id", "name", "slug", "sort_order", "is_active", "created_at", "updated_at") VALUES
  ('shw_cat_suits',  'Suits',  'suits',  10, true, now(), now()),
  ('shw_cat_blouse', 'Blouse', 'blouse', 20, true, now(), now()),
  ('shw_cat_saree',  'Saree',  'saree',  30, true, now(), now()),
  ('shw_cat_kurti',  'Kurti',  'kurti',  40, true, now(), now()),
  ('shw_cat_gala',   'Gala',   'gala',   50, true, now(), now()),
  ('shw_cat_baju',   'Baju',   'baju',   60, true, now(), now());

-- ── Seed the related-category links (plan §9). "A" = the category being
-- browsed, "B" = the categories whose designs are shown alongside it.
-- Read-side expands by both directions (union), so a symmetric seed is safest.
INSERT INTO "_RelatedShowcaseCategories" ("A", "B") VALUES
  ('shw_cat_suits',  'shw_cat_suits'),
  ('shw_cat_suits',  'shw_cat_gala'),
  ('shw_cat_suits',  'shw_cat_baju'),
  ('shw_cat_blouse', 'shw_cat_blouse'),
  ('shw_cat_blouse', 'shw_cat_gala'),
  ('shw_cat_blouse', 'shw_cat_baju'),
  ('shw_cat_saree',  'shw_cat_saree'),
  ('shw_cat_saree',  'shw_cat_blouse'),
  ('shw_cat_kurti',  'shw_cat_kurti'),
  ('shw_cat_kurti',  'shw_cat_gala'),
  ('shw_cat_kurti',  'shw_cat_baju'),
  ('shw_cat_gala',   'shw_cat_gala'),
  ('shw_cat_baju',   'shw_cat_baju');
