-- ============================================================================
-- Reset Demo Data — full wipe, keep shop (Supabase SQL Editor)
--
-- WHAT THIS DOES:
--   Hard-deletes ALL retail demo data: products, photos, variants, spin
--   frames, embeddings, collections + links/views/enquiries, customers + all
--   customer data, orders, staff, subscriptions, size charts, try-on data,
--   AI usage logs, quota counters, audit logs.
--
-- WHAT IT KEEPS (shop structure — required for a clean fresh start):
--   retailers, store_sections, product_categories, product_attributes,
--   default categories/attributes, team_members, territories, support_tickets,
--   background_images, plan_limits, plan_features, integration_settings,
--   ai_provider_configs, retailer_payment_accounts, retailer logos/banners.
--
-- HOW TO USE (run AFTER a backup — see scripts/backup-database.ts):
--   1. Supabase Dashboard -> Database -> Backups: take a manual backup.
--   2. Supabase -> SQL Editor -> paste ALL of this -> Run.
--   3. Expect a success banner: "Reset complete. X tables wiped, shop kept."
--      If ANY statement fails, the whole transaction rolls back — nothing is
--      half-deleted. Fix the error and re-run.
--
-- GUARDRAILS:
--   - SET app.allow_hard_delete = 'true' bypasses the F-017 triggers that
--     block hard DELETE/TRUNCATE on the 8 protected tables (products,
--     customers, collections, staff, orders, order_items, product_variants).
--     Without it every DELETE below is rejected by the DB.
--   - Deleting order is children-before-parents (FK-safe).
--   - retailers.storefront_collection_id is a loose pointer (no FK) — nulled
--     first so no shop points at a deleted collection.
--   - NEVER touch: retailers, product_categories, background_images.
-- ============================================================================

BEGIN;

SET app.allow_hard_delete = 'true';

-- Reset any shop's storefront pointer before collections disappear.
UPDATE retailers
SET storefront_collection_id = NULL
WHERE storefront_collection_id IS NOT NULL;

-- ── Children first (FK-safe order) ────────────────────────────────
DELETE FROM size_chart_rows;
DELETE FROM size_charts;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM collection_enquiries;
DELETE FROM collection_views;
DELETE FROM collection_products;
DELETE FROM collections;
DELETE FROM customer_interactions;
DELETE FROM customer_measurements;
DELETE FROM customer_fashion_dna;
DELETE FROM training_photo_consents;
DELETE FROM customers;
DELETE FROM product_spin_frames;
DELETE FROM product_photos;
DELETE FROM product_variants;
DELETE FROM product_embeddings;
DELETE FROM try_on_usage_logs;
DELETE FROM try_on_jobs;
DELETE FROM ai_usage_logs;
DELETE FROM products;
DELETE FROM usage_counters;
DELETE FROM quota_addon_purchases;
DELETE FROM subscription_payments;
DELETE FROM subscriptions;
DELETE FROM staff;
DELETE FROM audit_logs;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────
SELECT 'products' AS tbl, count(*) AS remaining FROM products
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'collections', count(*) FROM collections
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'retailers (KEPT)', count(*) FROM retailers
UNION ALL SELECT 'categories (KEPT)', count(*) FROM product_categories
UNION ALL SELECT 'background_images (KEPT)', count(*) FROM background_images;
