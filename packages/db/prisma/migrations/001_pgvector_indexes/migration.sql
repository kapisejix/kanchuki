-- Enable pgvector extension (Supabase has this pre-installed)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ─── Product Embeddings: IVFFlat index for cosine similarity ──────
-- lists = sqrt(expected_rows). Start at 100, tune at 100K+ products.
CREATE INDEX IF NOT EXISTS idx_product_embeddings_vector
  ON product_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Customer Fashion DNA: IVFFlat for preference matching ─────────
CREATE INDEX IF NOT EXISTS idx_customer_dna_vector
  ON customer_fashion_dna
  USING ivfflat (preference_vector vector_cosine_ops)
  WITH (lists = 50);

-- ─── Product full-text / array search ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_search_tags_gin
  ON products USING GIN (search_tags);

CREATE INDEX IF NOT EXISTS idx_products_occasions_gin
  ON products USING GIN (occasions);

CREATE INDEX IF NOT EXISTS idx_products_secondary_colors_gin
  ON products USING GIN (secondary_colors);

-- ─── Composite: retailer's available products by category ──────────
CREATE INDEX IF NOT EXISTS idx_products_retailer_status_cat
  ON products (retailer_id, status, category)
  WHERE deleted_at IS NULL;

-- ─── Collection analytics ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collection_views_col_date
  ON collection_views (collection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enquiries_retailer_status
  ON collection_enquiries (retailer_id, status, created_at DESC);

-- ─── Row-Level Security (RLS) ──────────────────────────────────────
-- Enable RLS on every table that stores retailer data

ALTER TABLE retailers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_embeddings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_fashion_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_views     ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Retailer isolation: authenticated user can only see their own data
-- (auth.uid()::text matches the auth_user_id on the retailer record)

CREATE POLICY "retailer_own_retailers" ON retailers
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid()::text);

CREATE POLICY "retailer_own_products" ON products
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));

CREATE POLICY "retailer_own_customers" ON customers
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));

CREATE POLICY "retailer_own_collections" ON collections
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));

-- Public collection read (customer-facing, no login)
CREATE POLICY "public_read_active_collections" ON collections
  FOR SELECT TO anon
  USING (status = 'ACTIVE' AND deleted_at IS NULL);

CREATE POLICY "public_read_collection_products" ON collection_products
  FOR SELECT TO anon
  USING (
    collection_id IN (
      SELECT id FROM collections
      WHERE status = 'ACTIVE' AND deleted_at IS NULL
    )
  );

-- Public can insert views + enquiries (anonymous tracking)
CREATE POLICY "public_insert_views" ON collection_views
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "public_insert_enquiries" ON collection_enquiries
  FOR INSERT TO anon WITH CHECK (true);

-- Service role (API) bypasses RLS — Supabase service key does this automatically
