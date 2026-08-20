-- F-021: Product & Store Ratings
-- Adds ProductReview, StoreReview tables, denormalized rating counters, and Google Place ID

-- CreateTable: product_reviews
CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable: store_reviews
CREATE TABLE "store_reviews" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique one review per customer per product
CREATE UNIQUE INDEX "product_reviews_product_id_customer_id_key" ON "product_reviews"("product_id", "customer_id");

-- CreateIndex: unique one store review per customer per retailer
CREATE UNIQUE INDEX "store_reviews_retailer_id_customer_id_key" ON "store_reviews"("retailer_id", "customer_id");

-- CreateIndex: query performance
CREATE INDEX "product_reviews_product_id_idx" ON "product_reviews"("product_id");
CREATE INDEX "product_reviews_retailer_id_idx" ON "product_reviews"("retailer_id");
CREATE INDEX "product_reviews_customer_id_idx" ON "product_reviews"("customer_id");
CREATE INDEX "product_reviews_rating_idx" ON "product_reviews"("rating");
CREATE INDEX "store_reviews_retailer_id_idx" ON "store_reviews"("retailer_id");
CREATE INDEX "store_reviews_customer_id_idx" ON "store_reviews"("customer_id");
CREATE INDEX "store_reviews_rating_idx" ON "store_reviews"("rating");

-- AddColumn: denormalized rating counters on Product
ALTER TABLE "products" ADD COLUMN "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

-- AddColumn: denormalized rating counters on Retailer
ALTER TABLE "retailers" ADD COLUMN "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "retailers" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

-- AddColumn: Google Business Profile place ID for review deep-link
ALTER TABLE "retailers" ADD COLUMN "google_place_id" TEXT;

-- AddForeignKey: product_reviews → products
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: product_reviews → customers
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: product_reviews → retailers
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: store_reviews → retailers
ALTER TABLE "store_reviews" ADD CONSTRAINT "store_reviews_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: store_reviews → customers
ALTER TABLE "store_reviews" ADD CONSTRAINT "store_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
