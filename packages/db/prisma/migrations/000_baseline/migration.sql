-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'SEEN', 'REPLIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'GROWTH', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TryOnStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_enquiries" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT,
    "message" TEXT,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_views" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "viewer_token" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "unique_viewer_count" INTEGER NOT NULL DEFAULT 0,
    "enquiry_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_fashion_dna" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "preference_vector" vector,
    "color_affinities" JSONB NOT NULL DEFAULT '{}',
    "style_affinities" JSONB NOT NULL DEFAULT '{}',
    "fabric_affinities" JSONB NOT NULL DEFAULT '{}',
    "occasion_affinities" JSONB NOT NULL DEFAULT '{}',
    "budget_range" JSONB NOT NULL DEFAULT '{}',
    "interaction_count" INTEGER NOT NULL DEFAULT 0,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_fashion_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_interactions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT,
    "collection_id" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_hash" TEXT,
    "pref_colors" TEXT[],
    "pref_styles" TEXT[],
    "pref_fabrics" TEXT[],
    "pref_occasions" TEXT[],
    "budget_min" INTEGER,
    "budget_max" INTEGER,
    "notes" TEXT,
    "last_visit_at" TIMESTAMP(3),
    "total_purchases" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_embeddings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "embedding" vector,
    "input_hash" TEXT NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_photos" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" INTEGER,
    "ai_tagged" BOOLEAN NOT NULL DEFAULT false,
    "ai_raw_response" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "photo_url" TEXT,
    "ai_preview_url" TEXT,
    "is_ai_preview" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price_override" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT,
    "price_min" INTEGER,
    "price_max" INTEGER,
    "mrp" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE',
    "category" TEXT,
    "product_type" TEXT,
    "primary_color" TEXT,
    "secondary_colors" TEXT[],
    "fabric_estimate" TEXT,
    "pattern" TEXT,
    "embellishments" TEXT[],
    "neck_style" TEXT,
    "sleeve_type" TEXT,
    "occasions" TEXT[],
    "search_tags" TEXT[],
    "metadata" JSONB,
    "notes" TEXT,
    "section_id" TEXT,
    "location_notes" TEXT,
    "ai_tagged" BOOLEAN NOT NULL DEFAULT false,
    "ai_tag_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailers" (
    "id" TEXT NOT NULL,
    "auth_user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "owner_name" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "gstin" TEXT,
    "categories" TEXT[],
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "plan_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "plan_expires_at" TIMESTAMP(3),
    "max_products" INTEGER NOT NULL DEFAULT 500,
    "max_customers" INTEGER NOT NULL DEFAULT 200,
    "try_on_credits" INTEGER NOT NULL DEFAULT 0,
    "razorpay_customer_id" TEXT,
    "razorpay_subscription_id" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "auth_user_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'salesperson',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_sections" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'rack',
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "store_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "amount_inr" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "razorpay_payment_id" TEXT,
    "razorpay_order_id" TEXT,
    "amount_excluding_gst" INTEGER,
    "gst_amount" INTEGER,
    "gst_invoice_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "billing_period" TEXT NOT NULL DEFAULT 'monthly',
    "amount_inr" INTEGER NOT NULL,
    "razorpay_subscription_id" TEXT,
    "razorpay_plan_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "try_on_jobs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "customer_photo_r2_key" TEXT NOT NULL,
    "result_r2_key" TEXT,
    "result_url" TEXT,
    "status" "TryOnStatus" NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "api_provider" TEXT NOT NULL,
    "api_job_id" TEXT,
    "api_cost_usd" DOUBLE PRECISION,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "customer_photo_deleted_at" TIMESTAMP(3),
    "result_expires_at" TIMESTAMP(3),

    CONSTRAINT "try_on_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type" ASC, "resource_id" ASC);

-- CreateIndex
CREATE INDEX "collection_enquiries_collection_id_idx" ON "collection_enquiries"("collection_id" ASC);

-- CreateIndex
CREATE INDEX "collection_enquiries_retailer_id_status_idx" ON "collection_enquiries"("retailer_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "collection_products_collection_id_idx" ON "collection_products"("collection_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collection_id_product_id_key" ON "collection_products"("collection_id" ASC, "product_id" ASC);

-- CreateIndex
CREATE INDEX "collection_views_collection_id_idx" ON "collection_views"("collection_id" ASC);

-- CreateIndex
CREATE INDEX "collection_views_collection_id_viewer_token_idx" ON "collection_views"("collection_id" ASC, "viewer_token" ASC);

-- CreateIndex
CREATE INDEX "collections_retailer_id_idx" ON "collections"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "collections_retailer_id_status_idx" ON "collections"("retailer_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "collections_slug_idx" ON "collections"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_fashion_dna_customer_id_key" ON "customer_fashion_dna"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "customer_fashion_dna_retailer_id_idx" ON "customer_fashion_dna"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "customer_interactions_customer_id_idx" ON "customer_interactions"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "customer_interactions_retailer_id_created_at_idx" ON "customer_interactions"("retailer_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "customers_retailer_id_idx" ON "customers"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "customers_retailer_id_phone_hash_idx" ON "customers"("retailer_id" ASC, "phone_hash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_retailer_id_phone_key" ON "customers"("retailer_id" ASC, "phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "product_embeddings_product_id_key" ON "product_embeddings"("product_id" ASC);

-- CreateIndex
CREATE INDEX "product_embeddings_retailer_id_idx" ON "product_embeddings"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "product_photos_product_id_idx" ON "product_photos"("product_id" ASC);

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id" ASC);

-- CreateIndex
CREATE INDEX "products_retailer_id_category_idx" ON "products"("retailer_id" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "products_retailer_id_deleted_at_idx" ON "products"("retailer_id" ASC, "deleted_at" ASC);

-- CreateIndex
CREATE INDEX "products_retailer_id_idx" ON "products"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "products_retailer_id_status_idx" ON "products"("retailer_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "retailers_auth_user_id_key" ON "retailers"("auth_user_id" ASC);

-- CreateIndex
CREATE INDEX "retailers_city_idx" ON "retailers"("city" ASC);

-- CreateIndex
CREATE INDEX "retailers_phone_idx" ON "retailers"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "retailers_phone_key" ON "retailers"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "staff_auth_user_id_key" ON "staff"("auth_user_id" ASC);

-- CreateIndex
CREATE INDEX "staff_retailer_id_idx" ON "staff"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "store_sections_retailer_id_idx" ON "store_sections"("retailer_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_razorpay_payment_id_key" ON "subscription_payments"("razorpay_payment_id" ASC);

-- CreateIndex
CREATE INDEX "subscription_payments_retailer_id_idx" ON "subscription_payments"("retailer_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_razorpay_subscription_id_key" ON "subscriptions"("razorpay_subscription_id" ASC);

-- CreateIndex
CREATE INDEX "subscriptions_retailer_id_idx" ON "subscriptions"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "try_on_jobs_retailer_id_idx" ON "try_on_jobs"("retailer_id" ASC);

-- CreateIndex
CREATE INDEX "try_on_jobs_status_idx" ON "try_on_jobs"("status" ASC);

-- AddForeignKey
ALTER TABLE "collection_enquiries" ADD CONSTRAINT "collection_enquiries_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fashion_dna" ADD CONSTRAINT "customer_fashion_dna_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "store_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_sections" ADD CONSTRAINT "store_sections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "store_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_sections" ADD CONSTRAINT "store_sections_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.8.0                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
