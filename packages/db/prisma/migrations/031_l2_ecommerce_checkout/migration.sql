-- Migration: l2_ecommerce_checkout (F-302)
-- Stage A — Direct-to-Retailer: RetailerPaymentAccount, Order, OrderItem

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('DIRECT', 'ROUTE');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED', 'FULFILLED');
CREATE TYPE "RouteOnboardingStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateTable: RetailerPaymentAccount
CREATE TABLE "retailer_payment_accounts" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'DIRECT',
    "razorpay_key_id" TEXT,
    "razorpay_key_secret_encrypted" TEXT,
    "razorpay_webhook_secret_encrypted" TEXT,
    "razorpay_linked_account_id" TEXT,
    "route_status" "RouteOnboardingStatus",
    "onboarding_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_payment_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retailer_payment_accounts_retailer_id_key" ON "retailer_payment_accounts"("retailer_id");

-- AddForeignKey
ALTER TABLE "retailer_payment_accounts" ADD CONSTRAINT "retailer_payment_accounts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Orders
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "collection_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "shipping_address" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal_amount" INTEGER NOT NULL,
    "gst_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'DIRECT',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "gst_invoice_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_razorpay_order_id_key" ON "orders"("razorpay_order_id");
CREATE INDEX "orders_retailer_id_idx" ON "orders"("retailer_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: OrderItems
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name_snapshot" TEXT,
    "price_snapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (retailer isolation for orders — retailers see their own orders)
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_orders" ON "orders"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));

-- RLS (retailer isolation for payment accounts)
ALTER TABLE "retailer_payment_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_payment_accounts" ON "retailer_payment_accounts"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
