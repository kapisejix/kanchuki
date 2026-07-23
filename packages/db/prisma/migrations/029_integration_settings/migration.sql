-- F-012: admin-managed, encrypted third-party credentials (Integration
-- Settings). Values are AES-256-GCM ciphertext, never plaintext — see
-- @kanchuki/db secrets.ts.

CREATE TYPE "IntegrationCategory" AS ENUM ('AI', 'PAYMENT', 'STORAGE', 'WHATSAPP');

CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "key_name" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "masked_preview" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_settings_key_name_key" ON "integration_settings"("key_name");

CREATE INDEX "integration_settings_category_idx" ON "integration_settings"("category");
