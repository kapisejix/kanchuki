-- Cluster E — growth sub-features
DROP TABLE IF EXISTS partner_referrals CASCADE;
DROP TABLE IF EXISTS partner_events    CASCADE;
DROP TABLE IF EXISTS partners          CASCADE;
DROP TABLE IF EXISTS referral_credits  CASCADE;
DROP TABLE IF EXISTS referrals         CASCADE;
DROP TABLE IF EXISTS supplier_transactions CASCADE;
DROP TABLE IF EXISTS suppliers         CASCADE;
DROP TABLE IF EXISTS bookings          CASCADE;
DROP TABLE IF EXISTS incentive_rules   CASCADE;
DROP TABLE IF EXISTS customer_visits   CASCADE;   -- §3.3
DROP TABLE IF EXISTS festival_backgrounds CASCADE;
DROP TABLE IF EXISTS lookbooks         CASCADE;

-- Cluster C — checkout
DROP TABLE IF EXISTS order_items       CASCADE;
DROP TABLE IF EXISTS orders            CASCADE;
DROP TABLE IF EXISTS retailer_payment_accounts CASCADE;  -- §3.2

-- Cluster A — VTO
DROP TABLE IF EXISTS training_photo_consents CASCADE;
DROP TABLE IF EXISTS try_on_usage_logs  CASCADE;
DROP TABLE IF EXISTS try_on_jobs        CASCADE;
DROP TABLE IF EXISTS customer_measurements CASCADE;

-- Cluster B — Fashion DNA + interaction log (§3.1 — both dropped)
DROP TABLE IF EXISTS customer_fashion_dna CASCADE;
DROP TABLE IF EXISTS customer_interactions CASCADE;
-- store_affinities is now unfed — drop it too
DROP TABLE IF EXISTS store_affinities CASCADE;

-- Cluster D — size charts
DROP TABLE IF EXISTS size_chart_rows   CASCADE;
DROP TABLE IF EXISTS size_charts       CASCADE;

-- Cluster F — spin
DROP TABLE IF EXISTS product_spin_frames CASCADE;

-- Orphaned columns on kept tables
ALTER TABLE retailers DROP COLUMN IF EXISTS try_on_credits;
ALTER TABLE retailers DROP COLUMN IF EXISTS referral_enabled;
ALTER TABLE retailers DROP COLUMN IF EXISTS referral_reward_paise;
ALTER TABLE products  DROP COLUMN IF EXISTS spin_status;
ALTER TABLE products  DROP COLUMN IF EXISTS spin_error;

-- Plan-matrix / quota rows for the dead feature keys
DELETE FROM plan_features WHERE feature_key IN
  ('SPIN_360','VIRTUAL_TRY_ON','CHECKOUT_CART','RAZORPAY_ROUTE',
   'PARTNER_NETWORK','INCENTIVE_ENGINE','FESTIVAL_BACKGROUNDS','LOOKBOOK_GENERATOR');
DELETE FROM plan_limits             WHERE resource_type = 'TRY_ON';
DELETE FROM retailer_limit_overrides WHERE resource_type = 'TRY_ON';
DELETE FROM usage_counters          WHERE resource_type = 'TRY_ON';
DELETE FROM quota_addon_purchases   WHERE resource_type = 'TRY_ON';

-- Standalone enums with no remaining table (CASCADE handled the columns already)
DROP TYPE IF EXISTS "TryOnStatus";
DROP TYPE IF EXISTS "MeasurementSource";
DROP TYPE IF EXISTS "TryOnSource";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "PaymentMode";
DROP TYPE IF EXISTS "RouteOnboardingStatus";
DROP TYPE IF EXISTS "SizeChartCategory";
DROP TYPE IF EXISTS "BookingStatus";
DROP TYPE IF EXISTS "SupplierTransactionKind";
DROP TYPE IF EXISTS "ReferralCreditStatus";
DROP TYPE IF EXISTS "PartnerType";
DROP TYPE IF EXISTS "CommissionType";
DROP TYPE IF EXISTS "PartnerReferralStatus";
DROP TYPE IF EXISTS "IncentiveTriggerType";
DROP TYPE IF EXISTS "IncentiveDiscountType";
-- PlanFeatureKey / QuotaResourceType keep their now-unused values (see note below).
