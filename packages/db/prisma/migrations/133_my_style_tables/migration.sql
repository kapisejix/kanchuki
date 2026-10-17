-- 133_my_style_tables
--
-- F-045 My Style, PR-1 (docs/tasks/pending/my-style.md §4.1). Requires 132 (enum value).
-- ADDITIVE ONLY: two ALTER TABLE ... ADD COLUMN (nullable, no default => no rewrite),
-- three new config tables, seeds. Nothing is dropped, renamed or backfilled.
--
-- Photos are never stored: the customer_accounts columns hold the *derived* profile
-- (undertone / depth / frame) only. "Clear my data" is an UPDATE ... = NULL.
--
-- No hard deletes (RC-049): the three new tables carry is_active, and NO DELETE is
-- granted. ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- kanchuki_app SELECT/INSERT/UPDATE on new tables, which is all admin edits need.
--
-- RLS: same two-part shape as 126/129 — policy for the two backend roles first, then
-- ENABLE, so there is never a window where RLS is on and the API sees 0 rows (RC-030).
-- These are global admin config tables (no retailer_id, no customer_id): RLS here
-- denies anon/authenticated (PostgREST) access; all access goes through apps/api.
--
-- No FK into retailers/products/customer_accounts => hardDeleteRetailer()'s table
-- list (RC-050) needs no new entry.
--
-- Index on products.color_family is a plain CREATE INDEX: Prisma runs this file in a
-- transaction, where CONCURRENTLY is illegal. The column is NULL for every row at
-- apply time (PR-2 backfills), so the build is a scan of a mostly-empty index.
--
-- SEED CONTENT IS FOR OWNER REVIEW before apply (spec §12 item 2): the palettes are
-- a first India-calibrated pass, not colour science. Every row is editable in Admin
-- later (PR-8); ON CONFLICT DO NOTHING so a re-run never overwrites an admin edit.

-- ── existing tables: additive columns ───────────────────────────
ALTER TABLE "products"
  ADD COLUMN "color_family" TEXT;                          -- normalised family of primary_color (PR-2); NULL = unmapped

CREATE INDEX "products_color_family_idx" ON "products"("color_family");

ALTER TABLE "customer_accounts"
  ADD COLUMN "skin_undertone"   TEXT,                      -- warm | cool | neutral
  ADD COLUMN "skin_depth"       TEXT,                      -- fair | medium | deep
  ADD COLUMN "body_frame"       TEXT,                      -- petite | average | tall | curvy
  ADD COLUMN "style_profile_at" TIMESTAMP(3),              -- when the profile above was last derived
  ADD CONSTRAINT "customer_accounts_skin_undertone_chk" CHECK ("skin_undertone" IN ('warm', 'cool', 'neutral')),
  ADD CONSTRAINT "customer_accounts_skin_depth_chk"     CHECK ("skin_depth" IN ('fair', 'medium', 'deep')),
  ADD CONSTRAINT "customer_accounts_body_frame_chk"     CHECK ("body_frame" IN ('petite', 'average', 'tall', 'curvy'));

-- ── color_families ──────────────────────────────────────────────
-- Admin-editable alias table: "Mustard", "Haldi" -> "yellow". `name` is the canonical
-- family written to products.color_family; `aliases` are the other spellings.
CREATE TABLE "color_families" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "aliases"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "color_families_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "color_families_name_lower_chk" CHECK ("name" = lower("name"))
);
CREATE UNIQUE INDEX "color_families_name_key" ON "color_families"("name");

-- ── style_palettes ──────────────────────────────────────────────
-- One row per (undertone, depth, version). good/avoid_families hold color_families.name
-- values; Postgres cannot FK an array element, so apps/api validates on admin write and
-- my-style-migration.test.ts pins the seed.
CREATE TABLE "style_palettes" (
  "id"             TEXT NOT NULL,
  "undertone"      TEXT NOT NULL,
  "depth"          TEXT NOT NULL,
  "good_families"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "avoid_families" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version"        INTEGER NOT NULL DEFAULT 1,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "style_palettes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "style_palettes_undertone_chk" CHECK ("undertone" IN ('warm', 'cool', 'neutral')),
  CONSTRAINT "style_palettes_depth_chk"     CHECK ("depth" IN ('fair', 'medium', 'deep')),
  CONSTRAINT "style_palettes_version_chk"   CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "style_palettes_undertone_depth_version_key" ON "style_palettes"("undertone", "depth", "version");

-- ── style_trends ────────────────────────────────────────────────
-- Admin-curated trend boosts (PR-10 reads them). Empty at launch: no seed.
CREATE TABLE "style_trends" (
  "id"             TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "kind"           TEXT NOT NULL,                          -- vocabulary defined by PR-10, deliberately not an enum yet
  "match_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "boost"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "starts_at"      TIMESTAMP(3),
  "ends_at"        TIMESTAMP(3),
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "style_trends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "style_trends_boost_chk" CHECK ("boost" >= 0 AND "boost" <= 1),
  CONSTRAINT "style_trends_window_chk" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" >= "starts_at")
);
CREATE INDEX "style_trends_is_active_idx" ON "style_trends"("is_active");

-- ── RLS ─────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '133: kanchuki_app/kanchuki_purge missing — RLS skipped. Run scripts/setup-role-separation.sql, then re-run this block (enabling RLS without the policy would make the API see 0 rows).';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['color_families', 'style_palettes', 'style_trends'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE tablename = t AND policyname = 'backend_roles_full_access'
        AND schemaname = ANY (current_schemas(false))
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
        'backend_roles_full_access', t
      );
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── seed: customer quota (D1: Kanchuki pays; admin-editable) ────
-- 3 analyses / customer / month. checkCustomerQuota fails OPEN without a row, and a
-- metered Vision call must not default to unlimited.
INSERT INTO "customer_resource_limits" ("id", "resource_type", "limit_per_period", "period", "updated_at")
VALUES ('crl_style_analysis', 'STYLE_ANALYSIS', 3, 'MONTH', CURRENT_TIMESTAMP)
ON CONFLICT ("resource_type") DO NOTHING;

-- ── seed: color_families (22) ───────────────────────────────────
-- Canonical lowercase `name`; aliases = common Indian-market spellings. An alias
-- appears under exactly ONE family (pinned by the test). Multi-word shades such as
-- "peacock blue" are whole-string aliases; PR-2's matcher must prefer the longest
-- alias so "peacock blue" -> teal and not blue.
INSERT INTO "color_families" ("id", "name", "aliases", "updated_at")
VALUES
  ('cf_red',     'red',     ARRAY['lal','scarlet','crimson','cherry','tomato red','ruby'], CURRENT_TIMESTAMP),
  ('cf_maroon',  'maroon',  ARRAY['wine','burgundy','oxblood','brick red','brick','mehroon'], CURRENT_TIMESTAMP),
  ('cf_pink',    'pink',    ARRAY['baby pink','rose','rose pink','blush','blush pink','light pink','gulabi'], CURRENT_TIMESTAMP),
  ('cf_magenta', 'magenta', ARRAY['rani','rani pink','fuchsia','hot pink','dark pink','cerise'], CURRENT_TIMESTAMP),
  ('cf_peach',   'peach',   ARRAY['coral','salmon','apricot','onion pink','onion'], CURRENT_TIMESTAMP),
  ('cf_orange',  'orange',  ARRAY['saffron','kesari','tangerine','burnt orange','rust','rust orange'], CURRENT_TIMESTAMP),
  ('cf_yellow',  'yellow',  ARRAY['mustard','mustard yellow','haldi','lemon','lemon yellow','canary','pila'], CURRENT_TIMESTAMP),
  ('cf_green',   'green',   ARRAY['bottle green','parrot green','mint','mint green','lime','sea green','pista','pista green','emerald','emerald green','mehendi','mehndi','hara'], CURRENT_TIMESTAMP),
  ('cf_olive',   'olive',   ARRAY['olive green','khaki','army green','moss','moss green','mehendi olive'], CURRENT_TIMESTAMP),
  ('cf_teal',    'teal',    ARRAY['peacock','peacock blue','peacock green','firozi','turquoise','aqua','sea blue','rama'], CURRENT_TIMESTAMP),
  ('cf_blue',    'blue',    ARRAY['sky blue','royal blue','cobalt','powder blue','baby blue','light blue','neela'], CURRENT_TIMESTAMP),
  ('cf_navy',    'navy',    ARRAY['navy blue','midnight blue','dark blue','indigo'], CURRENT_TIMESTAMP),
  ('cf_purple',  'purple',  ARRAY['lavender','lilac','violet','mauve','plum','brinjal','jamuni'], CURRENT_TIMESTAMP),
  ('cf_brown',   'brown',   ARRAY['chocolate','coffee','mocha','tan','camel','copper'], CURRENT_TIMESTAMP),
  ('cf_beige',   'beige',   ARRAY['nude','sand','taupe','fawn','skin','biscuit'], CURRENT_TIMESTAMP),
  ('cf_cream',   'cream',   ARRAY['ivory','off white','off-white','ecru','vanilla'], CURRENT_TIMESTAMP),
  ('cf_white',   'white',   ARRAY['pure white','safed'], CURRENT_TIMESTAMP),
  ('cf_black',   'black',   ARRAY['jet black','kala'], CURRENT_TIMESTAMP),
  ('cf_grey',    'grey',    ARRAY['gray','charcoal','slate','ash','steel grey'], CURRENT_TIMESTAMP),
  ('cf_gold',    'gold',    ARRAY['golden','antique gold','champagne'], CURRENT_TIMESTAMP),
  ('cf_silver',  'silver',  ARRAY['metallic silver','gunmetal'], CURRENT_TIMESTAMP),
  ('cf_multi',   'multi',   ARRAY['multicolor','multicolour','multi color','multi colour','multi-color','assorted'], CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- ── seed: style_palettes (9 = 3 undertones x 3 depths) ──────────
-- Heuristic: warm skin -> earthy/golden tones, cool -> jewel/icy tones, neutral ->
-- broad. Deeper skin carries saturated colours; "avoid" names tones that wash out,
-- not rules. `multi` appears in neither list: it cannot be palette-scored.
-- Shown to the customer as "your palette", never as a skin-colour label.
INSERT INTO "style_palettes" ("id", "undertone", "depth", "good_families", "avoid_families", "updated_at")
VALUES
  ('sp_warm_fair',      'warm',    'fair',   ARRAY['peach','cream','yellow','green','olive','teal','beige','gold','maroon','brown'],
                                             ARRAY['silver','grey','magenta','black'], CURRENT_TIMESTAMP),
  ('sp_warm_medium',    'warm',    'medium', ARRAY['yellow','orange','green','olive','teal','maroon','red','brown','gold','cream','peach'],
                                             ARRAY['silver','grey','magenta'], CURRENT_TIMESTAMP),
  ('sp_warm_deep',      'warm',    'deep',   ARRAY['gold','yellow','orange','red','maroon','green','teal','cream','white','peach'],
                                             ARRAY['brown','olive','beige','grey','silver'], CURRENT_TIMESTAMP),
  ('sp_neutral_fair',   'neutral', 'fair',   ARRAY['pink','peach','blue','teal','purple','maroon','navy','cream','green'],
                                             ARRAY['orange','yellow','beige'], CURRENT_TIMESTAMP),
  ('sp_neutral_medium', 'neutral', 'medium', ARRAY['red','maroon','pink','green','teal','blue','navy','purple','gold','cream','white'],
                                             ARRAY['olive','grey','beige'], CURRENT_TIMESTAMP),
  ('sp_neutral_deep',   'neutral', 'deep',   ARRAY['red','magenta','pink','orange','yellow','green','blue','purple','white','gold','cream'],
                                             ARRAY['brown','grey','olive'], CURRENT_TIMESTAMP),
  ('sp_cool_fair',      'cool',    'fair',   ARRAY['pink','blue','navy','purple','teal','grey','silver','white','maroon'],
                                             ARRAY['orange','yellow','gold','peach','beige'], CURRENT_TIMESTAMP),
  ('sp_cool_medium',    'cool',    'medium', ARRAY['magenta','pink','blue','navy','purple','teal','green','maroon','white','silver'],
                                             ARRAY['orange','yellow','gold','peach'], CURRENT_TIMESTAMP),
  ('sp_cool_deep',      'cool',    'deep',   ARRAY['white','magenta','pink','blue','purple','teal','green','red','silver','navy'],
                                             ARRAY['orange','brown','olive','beige'], CURRENT_TIMESTAMP)
ON CONFLICT ("undertone", "depth", "version") DO NOTHING;
