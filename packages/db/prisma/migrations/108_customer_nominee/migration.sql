-- DPDP Act s.14 right to nominate: a shopper may name someone to exercise their
-- data rights on death/incapacity. Existing rows stay NULL (no nominee).
ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS nominee_name TEXT,
  ADD COLUMN IF NOT EXISTS nominee_phone TEXT;
