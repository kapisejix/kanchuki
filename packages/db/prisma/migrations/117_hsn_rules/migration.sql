-- §6.11 — HSN_RULES becomes admin-editable (owner decision 2026-09-24).
--
-- Seeded verbatim from the in-code list in apps/api/src/jobs/catalog-sync.ts
-- (HSN_RULES_FALLBACK), so nothing changes until an admin edits a row. The
-- one translation: the old regex `cotton fabric|fabric.*cotton|^fabric$`
-- became the keyword 'cotton fabric' — keywords, not regex, are stored.
--
-- No RLS: platform-wide config read only by the backend (same as
-- plan_pricing / platform_gst_profile). No DELETE grant: rules are disabled
-- via is_active (SECURITY §19).

CREATE TABLE "hsn_rules" (
    "id"         TEXT NOT NULL,
    "keywords"   TEXT[] NOT NULL,
    "hsn"        TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hsn_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hsn_rules_hsn_format" CHECK ("hsn" ~ '^[0-9]{4}([0-9]{2}){0,2}$'),
    CONSTRAINT "hsn_rules_keywords_nonempty" CHECK (cardinality("keywords") > 0)
);

CREATE INDEX "hsn_rules_is_active_sort_order_idx" ON "hsn_rules"("is_active", "sort_order");

INSERT INTO "hsn_rules" ("id", "keywords", "hsn", "sort_order") VALUES
  ('hsn_rule_01', ARRAY['silk'], '5007', 10),
  ('hsn_rule_02', ARRAY['cotton fabric'], '5208', 20),
  ('hsn_rule_03', ARRAY['saree', 'saaree', 'sadi'], '5407', 30),
  ('hsn_rule_04', ARRAY['dupatta', 'stole', 'shawl', 'scarf'], '6214', 40),
  ('hsn_rule_05', ARRAY['tracksuit', 'track suit', 'legging'], '6211', 50),
  ('hsn_rule_06', ARRAY['jeans', 'trouser', 'pant'], '6204', 60),
  ('hsn_rule_07', ARRAY['shirt'], '6205', 70),
  ('hsn_rule_08', ARRAY['blouse', 'top'], '6206', 80),
  ('hsn_rule_09', ARRAY['dress', 'gown'], '6204', 90),
  ('hsn_rule_10', ARRAY['skirt'], '6204', 100),
  ('hsn_rule_11', ARRAY['kurta', 'kurti', 'kameez', 'suit', 'lehenga', 'lehanga', 'anarkali', 'salwar', 'churidar'], '6204', 110);
