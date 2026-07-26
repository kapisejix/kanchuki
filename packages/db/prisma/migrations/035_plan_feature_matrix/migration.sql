-- F-013: Plan Feature Matrix — boolean twin of plan_limits
-- Controls which features are enabled per plan tier (e.g. 360° spin, checkout, API access)
-- Admin-editable checkbox grid. hasFeature() fails CLOSED — missing row = feature OFF.

CREATE TYPE "PlanFeatureKey" AS ENUM (
  'BULK_ONBOARDING_IMPORT',
  'CUSTOM_BACKGROUND_LIBRARY',
  'SPIN_360',
  'VIRTUAL_TRY_ON',
  'WHATSAPP_BUSINESS_API',
  'CHECKOUT_CART',
  'DATA_EXPORT_CSV',
  'CUSTOM_BRANDING',
  'GHOST_MANNEQUIN_AI',
  'RAZORPAY_ROUTE',
  'API_ACCESS',
  'PRIORITY_AI_QUEUE',
  'MULTI_STORE'
);

CREATE TABLE "plan_features" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "plan" "SubscriptionPlan" NOT NULL,
  "feature_key" "PlanFeatureKey" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" TEXT,

  CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_features_plan_feature_key_key" UNIQUE ("plan", "feature_key")
);

-- Seed default feature settings matching the pricing table in PRO-REQUIREMENTS.md §12.1
-- Starter gets: catalog, AI tagging, WhatsApp links, AI search, regional UI
-- Growth adds: bulk import, custom backgrounds, 360° spin, VTO, WhatsApp API, data export, custom branding
-- Pro adds: ghost mannequin, Razorpay Route, API access, priority queue, multi-store

INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  -- Features enabled for ALL plans
  ('STARTER', 'SPIN_360', true),
  ('GROWTH', 'SPIN_360', true),
  ('PRO', 'SPIN_360', true),

  -- Bulk onboarding: Starter=off, Growth/Pro=on
  ('GROWTH', 'BULK_ONBOARDING_IMPORT', true),
  ('PRO', 'BULK_ONBOARDING_IMPORT', true),

  -- Custom background library: Starter=off, Growth/Pro=on
  ('GROWTH', 'CUSTOM_BACKGROUND_LIBRARY', true),
  ('PRO', 'CUSTOM_BACKGROUND_LIBRARY', true),

  -- Virtual try-on: Starter=off, Growth/Pro=on
  ('GROWTH', 'VIRTUAL_TRY_ON', true),
  ('PRO', 'VIRTUAL_TRY_ON', true),

  -- WhatsApp Business API (bring-your-own): Starter=off, Growth/Pro=on
  ('GROWTH', 'WHATSAPP_BUSINESS_API', true),
  ('PRO', 'WHATSAPP_BUSINESS_API', true),

  -- Checkout/cart: Starter=off, Growth/Pro=on
  ('GROWTH', 'CHECKOUT_CART', true),
  ('PRO', 'CHECKOUT_CART', true),

  -- Data export CSV: Starter=off, Growth/Pro=on
  ('GROWTH', 'DATA_EXPORT_CSV', true),
  ('PRO', 'DATA_EXPORT_CSV', true),

  -- Custom branding on collection pages: Starter=off, Growth/Pro=on
  ('GROWTH', 'CUSTOM_BRANDING', true),
  ('PRO', 'CUSTOM_BRANDING', true),

  -- Ghost mannequin AI: Starter=off, Growth=off, Pro=on
  ('PRO', 'GHOST_MANNEQUIN_AI', true),

  -- Razorpay Route split-payments: Starter=off, Growth=off, Pro=on
  ('PRO', 'RAZORPAY_ROUTE', true),

  -- API access (external integrations): Starter=off, Growth=off, Pro=on
  ('PRO', 'API_ACCESS', true),

  -- Priority AI tagging queue: Starter=off, Growth=off, Pro=on
  ('PRO', 'PRIORITY_AI_QUEUE', true),

  -- Multi-store management: Starter=off, Growth=off, Pro=on
  ('PRO', 'MULTI_STORE', true);

-- RLS: same deny-all-except-admin pattern as plan_limits and background_images
ALTER TABLE "plan_features" ENABLE ROW LEVEL SECURITY;
-- No policies defined = default deny for authenticated/anon roles
