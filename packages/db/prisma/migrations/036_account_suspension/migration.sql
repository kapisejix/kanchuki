-- F-015: Account Suspension
-- Adds retailer suspension and customer block fields to the schema.

-- 1. Add suspension fields to retailers table
ALTER TABLE retailers
  ADD COLUMN is_suspended     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN suspended_at     TIMESTAMPTZ,
  ADD COLUMN suspended_reason TEXT,
  ADD COLUMN suspended_by_id  TEXT;

CREATE INDEX idx_retailers_is_suspended ON retailers (is_suspended);

ALTER TABLE retailers
  ADD CONSTRAINT fk_retailers_suspended_by
    FOREIGN KEY (suspended_by_id) REFERENCES team_members(id)
    ON DELETE SET NULL;

-- 2. Add blocked fields to customers table
ALTER TABLE customers
  ADD COLUMN is_blocked     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN blocked_at     TIMESTAMPTZ,
  ADD COLUMN blocked_reason TEXT;

-- 3. Add suspended_retailers relation to team_members
-- (the FK above already links team_members, no additional column needed)
