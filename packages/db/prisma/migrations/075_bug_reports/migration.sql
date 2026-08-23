-- Retailer bug reports — in-app issue reporting with auto-captured device context.
-- Retailers submit from any screen; admin views and responds from /admin.

-- Create enums
CREATE TYPE "BugReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "BugReportStatus" AS ENUM ('NEW', 'REVIEWED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "BugReportSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BugReportStatus" NOT NULL DEFAULT 'NEW',

    -- Auto-captured device context
    "app_version" TEXT,
    "os_version" TEXT,
    "device_model" TEXT,
    "screen_name" TEXT,
    "last_screen" TEXT,
    "error_message" TEXT,
    "error_stack" TEXT,

    -- Optional screenshot (R2)
    "screenshot_url" TEXT,
    "screenshot_r2_key" TEXT,

    -- Retailer's own notes
    "notes" TEXT,

    -- Admin response
    "admin_note" TEXT,
    "resolved_by_id" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bug_reports_retailer_id_idx" ON "bug_reports"("retailer_id");
CREATE INDEX "bug_reports_status_idx" ON "bug_reports"("status");
CREATE INDEX "bug_reports_severity_idx" ON "bug_reports"("severity");
CREATE INDEX "bug_reports_created_at_idx" ON "bug_reports"("created_at");

ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_retailer_id_fkey"
    FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
