-- F-023: AI Provider Registry + per-call AI usage attribution.
-- Admin adds any tagging model + API key + priority order + weighted credit
-- cost in Admin → AI Providers. The failover engine (packages/ai/providers.ts)
-- reads this table instead of hardcoding claude/openai/gemini. AiUsageLog is
-- per-call attribution for the Admin → AI Usage dashboard.

CREATE TYPE "AiProviderType" AS ENUM ('ANTHROPIC', 'OPENAI_COMPAT', 'GEMINI');

CREATE TABLE "ai_provider_configs" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
    "provider_type"   "AiProviderType" NOT NULL,
    "label"           TEXT NOT NULL,
    "model_name"      TEXT NOT NULL,
    "lite_model_name" TEXT,
    "base_url"        TEXT,
    "api_key_name"    TEXT NOT NULL,
    "priority"        INTEGER NOT NULL DEFAULT 1,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "credits_per_call" INTEGER NOT NULL DEFAULT 1,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id"   TEXT,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_configs_active_priority_idx" ON "ai_provider_configs"("is_active", "priority");

CREATE TABLE "ai_usage_logs" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
    "retailer_id"   TEXT NOT NULL,
    "provider_id"   TEXT,
    "provider_type" "AiProviderType" NOT NULL,
    "model_name"    TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "credits_used"  INTEGER NOT NULL DEFAULT 1,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_logs_retailer_id_created_at_idx" ON "ai_usage_logs"("retailer_id", "created_at");
CREATE INDEX "ai_usage_logs_provider_id_idx" ON "ai_usage_logs"("provider_id");

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "ai_provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the three defaults matching the pre-registry hardcoded adapters so the
-- failover keeps working out of the box. Admin can edit models/priorities/
-- credits from Admin → AI Providers (no redeploy). OPENAI_COMPAT with a null
-- base_url defaults to api.openai.com — the same adapter also serves
-- OpenRouter/DeepSeek/Mistral/etc. via a base_url override.
INSERT INTO "ai_provider_configs" ("provider_type", "label", "model_name", "lite_model_name", "base_url", "api_key_name", "priority", "is_active", "credits_per_call") VALUES
  ('ANTHROPIC', 'Claude Sonnet (default)', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', NULL, 'ANTHROPIC_API_KEY', 1, true, 5),
  ('OPENAI_COMPAT', 'OpenAI GPT-4o-mini', 'gpt-4o-mini', NULL, NULL, 'OPENAI_API_KEY', 2, true, 2),
  ('GEMINI', 'Google Gemini Flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', NULL, 'GEMINI_API_KEY', 3, true, 1);

-- RLS: same deny-all-except-admin pattern as plan_limits (global admin config)
ALTER TABLE "ai_provider_configs" ENABLE ROW LEVEL SECURITY;
-- No policies defined = default deny for authenticated/anon roles.

-- AiUsageLog is retailer-scoped attribution — retailers can read their own.
ALTER TABLE "ai_usage_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retailer_own_ai_usage_logs" ON "ai_usage_logs"
  FOR SELECT TO authenticated
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));
