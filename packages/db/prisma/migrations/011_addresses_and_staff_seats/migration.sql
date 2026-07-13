-- Retailer: full address + staff seat limit (3 free, extra ₹199/mo per PRO-REQUIREMENTS.md §6)
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "address_line1" TEXT;
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "address_line2" TEXT;
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "max_staff_seats" INTEGER NOT NULL DEFAULT 3;

-- Customer: full address (previously had none)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address_line1" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address_line2" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
