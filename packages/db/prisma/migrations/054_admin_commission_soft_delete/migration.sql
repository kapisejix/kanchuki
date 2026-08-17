-- Soft delete for admin_commission_expenses.
-- SECURITY §19: the app role (kanchuki_app) is DELETE-less by design, so the
-- admin "delete expense" action sets deleted_at instead of hard-deleting;
-- every read filters deleted_at IS NULL (same pattern as products). The
-- purge cron role can hard-delete soft-deleted rows later.

ALTER TABLE "admin_commission_expenses"
  ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "admin_commission_expenses_deleted_at_idx"
  ON "admin_commission_expenses"("deleted_at");
