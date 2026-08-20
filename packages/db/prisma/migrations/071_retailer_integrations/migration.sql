-- AlterTable: Add Facebook Ads + Google Ads credential columns to retailers
ALTER TABLE "retailers" ADD COLUMN "gmb_configured_at" TIMESTAMP(3);
ALTER TABLE "retailers" ADD COLUMN "fb_ads_access_token" TEXT;
ALTER TABLE "retailers" ADD COLUMN "fb_ads_ad_account_id" TEXT;
ALTER TABLE "retailers" ADD COLUMN "fb_ads_page_id" TEXT;
ALTER TABLE "retailers" ADD COLUMN "fb_ads_configured_at" TIMESTAMP(3);
ALTER TABLE "retailers" ADD COLUMN "google_ads_refresh_token" TEXT;
ALTER TABLE "retailers" ADD COLUMN "google_ads_customer_id" TEXT;
ALTER TABLE "retailers" ADD COLUMN "google_ads_configured_at" TIMESTAMP(3);
ALTER TABLE "retailers" ADD COLUMN "google_ads_developer_token" TEXT;
