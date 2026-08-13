-- F-031 Social Media Publishing (Phase 1: Facebook Page connect + product posts).
-- SocialAccount: per-retailer connected platform account with F-012-encrypted token.
-- SocialPost: post history snapshot (what was pushed, where, and the result).

CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM');
CREATE TYPE "SocialPostType" AS ENUM ('SINGLE_PRODUCT', 'COLLECTION_LINK', 'CAROUSEL');
CREATE TYPE "SocialPostStatus" AS ENUM ('POSTED', 'FAILED');

CREATE TABLE "social_accounts" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "platform_account_id" TEXT NOT NULL,
  "platform_account_name" TEXT NOT NULL,
  "access_token_encrypted" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_accounts_retailer_id_platform_platform_account_id_key"
  ON "social_accounts"("retailer_id", "platform", "platform_account_id");

CREATE INDEX "social_accounts_retailer_id_idx" ON "social_accounts"("retailer_id");

CREATE TABLE "social_posts" (
  "id" TEXT NOT NULL,
  "retailer_id" TEXT NOT NULL,
  "social_account_id" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "post_type" "SocialPostType" NOT NULL,
  "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "collection_id" TEXT,
  "caption" TEXT NOT NULL,
  "external_post_id" TEXT,
  "external_post_url" TEXT,
  "status" "SocialPostStatus" NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_posts_retailer_id_created_at_idx" ON "social_posts"("retailer_id", "created_at");
CREATE INDEX "social_posts_social_account_id_idx" ON "social_posts"("social_account_id");

ALTER TABLE "social_accounts"
  ADD CONSTRAINT "social_accounts_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "social_posts"
  ADD CONSTRAINT "social_posts_retailer_id_fkey"
  FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "social_posts"
  ADD CONSTRAINT "social_posts_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
