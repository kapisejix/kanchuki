-- Add optional email field to customer profile
-- Email is optional, not unique — multiple customers can share an email
-- (family context, joint accounts, etc.)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" TEXT;
