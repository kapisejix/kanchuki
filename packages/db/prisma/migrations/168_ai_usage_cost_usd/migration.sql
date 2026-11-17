-- F-034 T5: AI promo video clips are billed by Fal in USD per clip, which the
-- integer credits_used cannot hold. cost_usd keeps the real per-call cost; NULL
-- for the existing credit-only rows. The FAL enum value was added in prod by the
-- owner on 2026-11-17 ahead of this file; IF NOT EXISTS keeps both paths safe.
-- The value is not used in this migration, so it may share the transaction.
-- Column add inherits the table's existing grants and RLS policy.
ALTER TYPE "AiProviderType" ADD VALUE IF NOT EXISTS 'FAL';

ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "cost_usd" DECIMAL(10,4);
