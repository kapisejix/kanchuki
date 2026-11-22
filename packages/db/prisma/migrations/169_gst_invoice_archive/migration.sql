-- 169: Append-only archive of issued GST invoices (7-year retention).
--
-- hardDeleteRetailer and purge-soft-deleted destroy subscription_payments and
-- quota_addon_purchases, and those rows read the buyer's name, GSTIN and address live
-- from retailers. Each delete path now copies numbered invoices here in the same
-- transaction. No phone, auth id or KYC data. No FK: rows must outlive the retailer.
--
-- OWNER: review, then apply by hand as postgres (a table owner can disable the
-- append-only trigger, so not kanchuki_migrator). Deploy this BEFORE the
-- API code: without the table every retailer delete fails and rolls back.
-- gst_invoice_sequences is untouched. Automatic 7-year expiry is not built.

DO $$
BEGIN
  -- An owner bypasses grants and can drop the trigger, so an app role must not own this.
  IF current_user IN ('kanchuki_app', 'kanchuki_purge', 'kanchuki_migrator') THEN
    RAISE EXCEPTION 'Apply migration 169 as postgres, not %', current_user;
  END IF;
END
$$;

CREATE TABLE "gst_invoice_archive" (
  "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "source_table"         TEXT NOT NULL,
  "source_id"            TEXT NOT NULL,
  "source_status"        TEXT NOT NULL,
  "invoice_number"       TEXT NOT NULL,
  "invoice_date"         TIMESTAMP(3) NOT NULL,
  "amount_inr"           INTEGER NOT NULL,
  "amount_excluding_gst" INTEGER,
  "gst_amount"           INTEGER,
  "gst_rate"             DECIMAL(4,4),
  "cgst_amount"          INTEGER,
  "sgst_amount"          INTEGER,
  "igst_amount"          INTEGER,
  "place_of_supply"      TEXT,
  "sac_code"             TEXT,
  "buyer_name"           TEXT NOT NULL,
  "buyer_gstin"          TEXT,
  "buyer_address"        TEXT,
  "invoice_r2_key"       TEXT NOT NULL,
  "razorpay_payment_id"  TEXT,
  "razorpay_order_id"    TEXT,
  "archived_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "gst_invoice_archive_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gst_invoice_archive_source_check"
    CHECK ("source_table" IN ('subscription_payments', 'quota_addon_purchases'))
);

CREATE UNIQUE INDEX "gst_invoice_archive_invoice_number_key"
  ON "gst_invoice_archive" ("invoice_number");
CREATE UNIQUE INDEX "gst_invoice_archive_source_table_source_id_key"
  ON "gst_invoice_archive" ("source_table", "source_id");
CREATE INDEX "gst_invoice_archive_invoice_date_idx"
  ON "gst_invoice_archive" ("invoice_date");

-- Append-only for every role, including the purge role's allow_hard_delete bypass.
CREATE FUNCTION gst_invoice_archive_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'gst_invoice_archive is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gst_invoice_archive_no_change
  BEFORE UPDATE OR DELETE ON "gst_invoice_archive"
  FOR EACH ROW EXECUTE FUNCTION gst_invoice_archive_append_only();
CREATE TRIGGER gst_invoice_archive_no_truncate
  BEFORE TRUNCATE ON "gst_invoice_archive"
  FOR EACH STATEMENT EXECUTE FUNCTION gst_invoice_archive_append_only();

ALTER TABLE "gst_invoice_archive" ENABLE ROW LEVEL SECURITY;

-- Default privileges may have granted these roles access, so clear them first.
-- Roles are guarded because not every environment has all of them.
DO $$
DECLARE r text;
BEGIN
  REVOKE ALL ON TABLE "gst_invoice_archive" FROM PUBLIC;
  REVOKE ALL ON FUNCTION gst_invoice_archive_append_only() FROM PUBLIC;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'kanchuki_app', 'kanchuki_purge', 'kanchuki_replica_reader'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "gst_invoice_archive" FROM %I', r);
    END IF;
  END LOOP;

  FOREACH r IN ARRAY ARRAY['kanchuki_app', 'kanchuki_purge', 'kanchuki_replica_reader'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON TABLE "gst_invoice_archive" TO %I', r);
      EXECUTE format(
        'CREATE POLICY %I ON "gst_invoice_archive" FOR SELECT TO %I USING (true)',
        'gst_invoice_archive_read_' || r, r
      );
    END IF;
  END LOOP;

  -- Only the delete paths write here, and they run as kanchuki_purge.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    GRANT INSERT ON TABLE "gst_invoice_archive" TO kanchuki_purge;
    CREATE POLICY "gst_invoice_archive_insert_purge" ON "gst_invoice_archive"
      FOR INSERT TO kanchuki_purge WITH CHECK (true);
  END IF;
END
$$;
