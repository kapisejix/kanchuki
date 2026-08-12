-- Fix Supabase linter: rls_disabled_in_public on public.integration_settings
-- Admin-only encrypted secrets table (F-012) — same deny-all-except-admin
-- pattern as plan_features/background_images (migration 035).

ALTER TABLE "integration_settings" ENABLE ROW LEVEL SECURITY;
-- No policies defined = default deny for authenticated/anon roles
