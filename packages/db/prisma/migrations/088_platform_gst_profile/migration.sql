-- 088: platform GST profile (seller identity for subscription GST invoices).
-- The Prisma model PlatformGstProfile / @@map("platform_gst_profile") shipped
-- with the GST invoice engine (91144cb) but no migration created the table,
-- so generate-gst-invoice.ts and billing.ts webhook read a table that does not
-- exist in prod. This adds it. Singleton row (id = 'singleton') set once via
-- PUT /v1/admin/gst-profile.
-- Applied via admin dashboard with approval (CLAUDE.md operational policy).
CREATE TABLE IF NOT EXISTS "platform_gst_profile" (
  "id"             TEXT NOT NULL DEFAULT 'singleton',
  "company_name"   TEXT NOT NULL,
  "gstin"          TEXT NOT NULL,
  "address_line1"  TEXT NOT NULL,
  "address_line2"  TEXT,
  "city"           TEXT NOT NULL,
  "state"          TEXT NOT NULL,
  "state_code"     TEXT NOT NULL,
  "pan"            TEXT,
  "invoice_prefix" TEXT NOT NULL DEFAULT 'KAN',
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_gst_profile_pkey" PRIMARY KEY ("id")
);
