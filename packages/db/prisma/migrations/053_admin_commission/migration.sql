-- Admin 3% commission expense ledger.
-- The monthly 3% commission is computed on the fly from successful
-- subscription_payments (status='success', grouped by paid_at month) — this
-- table stores only the admin's expense entries charged against each month's
-- commission. `period` = YYYY-MM commission month; `category` = free-text
-- "where did the money go". Admin panel only, no retailer surface.

CREATE TABLE "admin_commission_expenses" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amount_inr" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "expense_date" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "admin_commission_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_commission_expenses_period_idx" ON "admin_commission_expenses"("period");
CREATE INDEX "admin_commission_expenses_expense_date_idx" ON "admin_commission_expenses"("expense_date");
