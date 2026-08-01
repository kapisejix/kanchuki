-- F-023 follow-up: seed Llama 3.2 Vision fallback providers (NVIDIA NIM).
-- 041 seeded Claude/OpenAI/Gemini; this adds two OPENAI_COMPAT rows pointing at
-- NVIDIA's OpenAI-protocol endpoint (https://integrate.api.nvidia.com/v1) so a
-- retailer's tagging keeps working even when every paid provider is out of
-- credits — the Llama vision models are free/cheap on NIM. They sit at the END
-- of the priority chain (4, 5) so Claude/GPT/Gemini keep serving first.
--
-- The rows are seeded is_active=true but do nothing until NVIDIA_API_KEY is
-- configured (Admin → Integrations or .env of the same name): providers.ts
-- skips any row whose key is missing. So "activate as fallback" = add the key,
-- no row edits needed.
INSERT INTO "ai_provider_configs" ("provider_type", "label", "model_name", "lite_model_name", "base_url", "api_key_name", "priority", "is_active", "credits_per_call") VALUES
  ('OPENAI_COMPAT', 'Llama 3.2 90B Vision (free fallback)', 'meta/llama-3.2-90b-vision-instruct', NULL, 'https://integrate.api.nvidia.com/v1', 'NVIDIA_API_KEY', 4, true, 1),
  ('OPENAI_COMPAT', 'Llama 3.2 11B Vision (cheap fallback)', 'meta/llama-3.2-11b-vision-instruct', NULL, 'https://integrate.api.nvidia.com/v1', 'NVIDIA_API_KEY', 5, true, 1);
