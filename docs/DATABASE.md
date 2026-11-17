# Kanchuki — Database Schema

**Version:** 1.0  
**Engine:** PostgreSQL 16 + pgvector 0.7  
**ORM:** Prisma 5  
**Hosting:** Supabase (managed)

---

> **⚠️ This document is a secondary reference. `packages/db/prisma/schema.prisma`
> is authoritative.** The feature teardown (`chore/remove-unwanted-features`,
> migration `082_remove_unwanted_features`, 2026-08-31) dropped 24 tables —
> `try_on_jobs`, `try_on_usage_logs`, `training_photo_consents`,
> `customer_measurements`, `customer_fashion_dna`, `customer_interactions`,
> `store_affinities`, `orders`, `order_items`, `retailer_payment_accounts`,
> `size_charts`, `size_chart_rows`, `product_spin_frames`, `incentive_rules`,
> `suppliers`, `supplier_transactions`, `bookings`, `referrals`,
> `referral_credits`, `partners`, `partner_referrals`, `partner_events`,
> `festival_backgrounds`, `lookbooks`, `customer_visits` — plus the columns
> `retailers.try_on_credits` / `referral_enabled` / `referral_reward_paise` and
> `products.spin_status` / `spin_error`, and 15 now-dead enums. SDL blocks and
> ERD lines below that reference those tables are historical. Full breakdown:
> `docs/references/history/reports/2026-08-31-feature-teardown-spec.md`.

## Design Principles

1. **Row-Level Security (RLS):** Every retailer's data is isolated at DB level. `retailer_id` on every table, RLS policy enforces it.
2. **JSONB for flexible metadata:** Product attributes are domain-specific and evolving. Use `metadata JSONB` rather than 30 columns.
3. **pgvector for AI:** Product embeddings stored natively (`product_embeddings`). No separate vector DB needed at MVP scale. *(Customer Fashion DNA vectors removed 2026-08-31.)*
4. **Soft delete:** Never hard-delete business records. `deleted_at TIMESTAMP` flag.
5. **Audit trail:** `created_at`, `updated_at` on all tables. `updated_by` where ownership matters.

---

## Entity Relationship Diagram

```
retailers ──── products (1:many)
retailers ──── customers (1:many)
retailers ──── collections (1:many)
retailers ──── staff (1:many)

products ──── product_photos (1:many)
products ──── product_variants (1:many, color variants)
products ──── product_embeddings (1:1)

collections ──── collection_products (M:M via join table)
collections ──── collection_views (1:many, analytics)
collections ──── collection_enquiries (1:many)

wholesalers ──── wholesaler_catalogs (Phase 2)
manufacturers ──── manufacturer_designs (Phase 2)

subscriptions ──── subscription_events (billing history)

# customer_fashion_dna, customer_interactions, customer_measurements,
# try_on_jobs, retailer_payment_accounts, orders, order_items — REMOVED
# 2026-08-31 (migration 082). See banner above.
```

---

## Schema (Prisma SDL)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum UserRole {
  RETAILER
  WHOLESALER
  MANUFACTURER
  ADMIN
}

enum TeamRole {
  SUPER_ADMIN
  MARKETING_MANAGER
  MARKETING_AGENT
  SUPPORT_MANAGER
  SUPPORT_AGENT
}

enum TerritoryLevel {
  STATE
  CITY
  ZONE
}

enum TicketStatus {
  OPEN
  ASSIGNED
  RESOLVED
  CLOSED
}

// planned F-019
enum TicketType {
  GENERAL
  CATALOG_UPLOAD
}

enum ProductStatus {
  AVAILABLE
  SOLD
  RESERVED
  NOT_SURE
}

enum SubscriptionPlan {
  STARTER
  GROWTH
  PRO
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELLED
}

enum CollectionStatus {
  ACTIVE
  EXPIRED
  ARCHIVED
}

enum EnquiryStatus {
  NEW
  SEEN
  REPLIED
  CLOSED
}

// ─────────────────────────────────────────────
// CORE: RETAILERS
// ─────────────────────────────────────────────

model Retailer {
  id              String   @id @default(cuid())
  phone           String   @unique
  shop_name       String
  owner_name      String?
  city            String
  state           String?
  gstin           String?           // optional at signup, required for billing
  categories      String[]          // ["suits", "sarees", "kurtis"]
  pincode         String?           // used to auto-derive territory_id at signup

  // Internal team attribution (Section 10, PRO-REQUIREMENTS.md)
  territory_id     String?
  onboarded_by_id  String?          // TeamMember.id — marketing agent who signed them up
  support_owner_id String?          // TeamMember.id — current support point of contact
  
  // Subscription
  plan            SubscriptionPlan @default(STARTER)
  plan_status     SubscriptionStatus @default(TRIAL)
  trial_ends_at   DateTime?
  plan_expires_at DateTime?
  
  // Limits (derived from plan, but cached here for fast checks)
  max_products    Int     @default(500)
  max_customers   Int     @default(200)
  
  // Razorpay
  razorpay_customer_id    String?
  razorpay_subscription_id String?
  
  // Onboarding
  onboarding_completed Boolean @default(false)
  onboarding_step      Int     @default(0)

  // Suspension (F-015, planned) — reversible, distinct from deleted_at (soft-delete)
  is_suspended     Boolean  @default(false)
  suspended_at     DateTime?
  suspended_reason String?
  suspended_by_id  String?  // TeamMember.id

  // Store-directory curation (built 2026-08-11) — admin pins stores so they
  // sort to the top of /stores and the homepage teaser (see public-stores.ts
  // orderBy). Admin-only flag, no retailer-facing surface.
  is_featured     Boolean   @default(false)
  featured_at     DateTime?

  // Timestamps
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  deleted_at DateTime?
  
  // Relations
  products     Product[]
  customers    Customer[]
  collections  Collection[]
  staff        Staff[]
  subscriptions Subscription[]
  store_sections StoreSection[]
  territory      Territory?   @relation(fields: [territory_id], references: [id])
  onboarded_by   TeamMember?  @relation("OnboardedRetailers", fields: [onboarded_by_id], references: [id])
  support_owner  TeamMember?  @relation("SupportedRetailers", fields: [support_owner_id], references: [id])
  support_tickets SupportTicket[]
  suspended_by   TeamMember?  @relation("SuspendedRetailers", fields: [suspended_by_id], references: [id])

  // Shop map pin (migration 147 columns, 151 location_source). Written by PUT /v1/retailers/me
  // (RC-163: that route accepted but never wrote them before). location_source says where the
  // pair came from: 'RETAILER_PIN' (retailer pinned in the app) | 'GEOCODED_APPROX' (guessed from
  // the typed address by scripts/backfill-retailer-location.ts) | NULL (no pin).
  latitude        Float?
  longitude       Float?
  location_source String?

  @@index([latitude, longitude])
  @@index([phone])
  @@index([city])
  @@index([territory_id])
  @@index([is_suspended])
  @@map("retailers")
}

// ─────────────────────────────────────────────
// STORE STRUCTURE (Rack/Shelf)
// ─────────────────────────────────────────────

model StoreSection {
  id          String  @id @default(cuid())
  retailer_id String
  name        String  // "Rack A", "Section B", "Front Display"
  type        String  // "rack" | "shelf" | "section" | "floor" | "box"
  parent_id   String? // for nested structure (shelf inside rack)
  sort_order  Int     @default(0)
  
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  parent      StoreSection? @relation("SectionTree", fields: [parent_id], references: [id])
  children    StoreSection[] @relation("SectionTree")
  products    Product[]
  
  @@index([retailer_id])
  @@map("store_sections")
}

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

model Product {
  id          String  @id @default(cuid())
  retailer_id String
  
  // Core fields
  name        String?           // optional — AI generates this
  price_min   Decimal?          // ₹ — minimum selling price
  price_max   Decimal?          // ₹ — maximum (for range pricing)
  mrp         Decimal?          // MRP if known
  status      ProductStatus @default(AVAILABLE)
  
  // AI-generated tags (editable by retailer)
  category    String?           // "Ladies Suit", "Saree", "Kurti", etc.
  product_type String?          // "Unstitched", "Semi-stitched", "Ready-made"
  audience    ProductAudience?  // migration 160: WOMEN|MEN|BOYS|GIRLS|KIDS_UNISEX; NULL = adult unisex / undecided
  kids_age_group KidsAgeGroup?  // migration 160: NEW_BORN|AGE_0_2|AGE_3_5|AGE_6_8|AGE_9_12|AGE_13_16; kids audiences only
  primary_color String?         // "Pink", "Maroon", "Navy Blue"
  secondary_colors String[]     // ["Gold", "White"]
  fabric_estimate String?       // "Cotton", "Silk", "Georgette"
  pattern     String?           // "Embroidered", "Printed", "Plain"
  embellishments String[]       // ["Zari", "Mirror Work", "Gota"]
  neck_style  String?           // "V-Neck", "Round Neck", "Boat Neck"
  sleeve_type String?           // "Full Sleeve", "3/4 Sleeve", "Sleeveless"
  occasions   String[]          // ["Party Wear", "Wedding", "Casual"]
  search_tags String[]          // All searchable keywords
  
  // Additional metadata (flexible)
  metadata    Json?             // {"design_number": "1045", "brand": "...", ...}
  notes       String?           // Retailer's private notes
  
  // Physical location in store
  section_id  String?           // FK to StoreSection
  location_notes String?        // "Stack 2, second from top"
  
  // Source (for B2B — Phase 2)
  source      String?           // "own" | "wholesaler" | "manufacturer"
  source_id   String?           // FK to wholesaler/manufacturer catalog item
  
  // Timestamps
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?
  
  // Relations
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  section     StoreSection? @relation(fields: [section_id], references: [id])
  photos      ProductPhoto[]
  variants    ProductVariant[]
  embedding   ProductEmbedding?
  collection_items CollectionProduct[]
  interactions CustomerInteraction[]
  
  @@index([retailer_id])
  @@index([retailer_id, status])
  @@index([retailer_id, category])
  @@index([retailer_id, deleted_at])
  @@map("products")
}

model ProductPhoto {
  id          String  @id @default(cuid())
  product_id  String
  retailer_id String  // denormalized for RLS
  
  url         String  // R2 object URL
  r2_key      String  // R2 object key (for deletion)
  is_primary  Boolean @default(false)
  width       Int?
  height      Int?
  size_bytes  Int?
  
  // AI tagging was done from this photo
  ai_tagged   Boolean @default(false)
  ai_raw_response Json? // store raw Claude response for debugging
  
  sort_order  Int @default(0)
  created_at  DateTime @default(now())
  
  product     Product @relation(fields: [product_id], references: [id], onDelete: Cascade)
  
  @@index([product_id])
  @@map("product_photos")
}

model ProductVariant {
  id          String @id @default(cuid())
  product_id  String
  retailer_id String // denormalized for RLS
  
  color       String  // "Maroon"
  photo_url   String? // actual photo of this color, if available
  ai_preview_url String? // AI-generated color preview (marked as preview)
  is_ai_preview Boolean @default(false)
  status      ProductStatus @default(AVAILABLE)
  price_override Decimal? // if this color variant has different pricing
  
  created_at  DateTime @default(now())
  
  product     Product @relation(fields: [product_id], references: [id], onDelete: Cascade)
  
  @@index([product_id])
  @@map("product_variants")
}

// pgvector embedding for semantic search
model ProductEmbedding {
  id          String @id @default(cuid())
  product_id  String @unique
  retailer_id String
  
  // OpenAI text-embedding-3-small (1536-dim)
  embedding   Unsupported("vector(1536)")?
  
  // Input used to generate embedding (for cache invalidation)
  input_hash  String  // SHA-256 of concatenated product fields
  model_version String @default("text-embedding-3-small")
  
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  
  product     Product @relation(fields: [product_id], references: [id], onDelete: Cascade)
  
  @@index([retailer_id])
  @@map("product_embeddings")
}

// ─────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────

model Customer {
  id          String  @id @default(cuid())
  retailer_id String
  
  name        String
  phone       String          // stored as-is (retailer-owned)
  phone_hash  String?         // SHA-256 for dedup check
  
  // Preferences (manually captured by retailer)
  pref_colors     String[]    // ["Pink", "Maroon", "Mustard"]
  pref_styles     String[]    // ["Party Wear", "Casual", "Wedding"]
  pref_fabrics    String[]    // ["Cotton", "Silk"]
  pref_occasions  String[]    // ["Festive", "Office"]
  budget_min  Decimal?        // ₹
  budget_max  Decimal?        // ₹
  
  // Notes
  notes       String?         // "Avoids polyester. Has 3 kids."
  
  // Derived
  last_visit_at   DateTime?
  total_purchases Int @default(0)
  total_spent     Decimal @default(0)

  // Abuse flag (F-015, planned) — customers have no login (Section 2.2 PRO-REQUIREMENTS),
  // so "suspend" means blocking new enquiries/checkout, not an account lock
  is_blocked     Boolean  @default(false)
  blocked_at     DateTime?
  blocked_reason String?

  // Timestamps
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?
  
  // Relations
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  fashion_dna CustomerFashionDNA?
  interactions CustomerInteraction[]
  collections_sent Collection[] @relation("CustomerCollections")
  measurements CustomerMeasurement[]
  
  @@unique([retailer_id, phone])
  @@index([retailer_id])
  @@index([retailer_id, phone_hash])
  @@map("customers")
}

// CustomerMeasurement, CustomerFashionDNA, CustomerInteraction — REMOVED
// 2026-08-31 (migration 082). See banner at the top of this file.

// ─────────────────────────────────────────────
// COLLECTIONS (WhatsApp Share Links)
// ─────────────────────────────────────────────

model Collection {
  id          String  @id @default(cuid())
  retailer_id String
  customer_id String? // if personalized for specific customer
  
  title       String
  description String?
  slug        String  @unique // URL-friendly slug for the shareable link
  status      CollectionStatus @default(ACTIVE)
  
  expires_at  DateTime?
  
  // Stats (cached — real data in collection_views/enquiries)
  view_count    Int @default(0)
  unique_viewer_count Int @default(0)
  enquiry_count Int @default(0)
  favorite_count Int @default(0)
  
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?
  
  // Relations
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  customer    Customer? @relation("CustomerCollections", fields: [customer_id], references: [id])
  products    CollectionProduct[]
  views       CollectionView[]
  enquiries   CollectionEnquiry[]
  
  @@index([retailer_id])
  @@index([slug])
  @@index([retailer_id, status])
  @@map("collections")
}

model CollectionProduct {
  id            String @id @default(cuid())
  collection_id String
  product_id    String
  sort_order    Int @default(0)
  
  collection  Collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  product     Product @relation(fields: [product_id], references: [id])
  
  @@unique([collection_id, product_id])
  @@index([collection_id])
  @@map("collection_products")
}

model CollectionView {
  id            String   @id @default(cuid())
  collection_id String
  retailer_id   String
  
  viewer_token  String?  // anonymous session token (localStorage)
  ip_hash       String?  // anonymized
  user_agent    String?
  referrer      String?
  
  created_at    DateTime @default(now())
  
  collection    Collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  
  @@index([collection_id])
  @@index([collection_id, viewer_token])
  @@map("collection_views")
}

model CollectionEnquiry {
  id            String   @id @default(cuid())
  collection_id String
  retailer_id   String
  
  product_id    String?  // first product (= product_ids[0]), kept for old readers
  product_ids   String[] @default([]) // F-044 (migration 130): every product sent, deduped, all same retailer
  assigned_staff_id String? // F-044 inbox Take: Staff.id, or retailer.id for owner — no FK
  assigned_at   DateTime?
  message       String?  // pre-filled message content
  customer_name String?  // if customer shared name
  customer_phone String? // if customer shared phone
  status        EnquiryStatus @default(NEW)
  
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
  
  collection    Collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  
  @@index([collection_id])
  @@index([retailer_id, status])
  @@map("collection_enquiries")
}

// ─────────────────────────────────────────────
// STAFF
// ─────────────────────────────────────────────

model Staff {
  id          String  @id @default(cuid())
  retailer_id String
  
  name        String
  phone       String
  role        String  // "owner" | "salesperson" | "manager"
  is_active   Boolean @default(true)
  
  // Auth (Supabase user)
  auth_user_id String? @unique
  
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  
  @@index([retailer_id])
  @@index([phone])
  @@map("staff")
}

// ─────────────────────────────────────────────
// INTERNAL TEAM (Kanchuki admin/marketing/support)
// Built — see PRO-REQUIREMENTS.md Section 10. F-018/F-019 additions built 2026-07-28.
// ─────────────────────────────────────────────

model TeamMember {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  password_hash String
  role          TeamRole
  is_active     Boolean  @default(true)
  max_retailers Int?     // soft cap; dashboard flags when exceeded, never blocks onboarding
  referral_code String?  @unique // planned F-018 — code a retailer can enter at self-serve signup to attribute onboarding to this agent

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  territories         TeamMemberTerritory[]
  onboarded_retailers Retailer[] @relation("OnboardedRetailers")
  supported_retailers Retailer[] @relation("SupportedRetailers")
  assigned_tickets    SupportTicket[]
  suspended_retailers Retailer[] @relation("SuspendedRetailers")

  @@index([email])
  @@map("team_members")
}

model Territory {
  id        String          @id @default(cuid())
  name      String
  level     TerritoryLevel
  parent_id String?         // self-reference: ZONE -> CITY -> STATE
  pincodes  String[]        // only meaningful at ZONE level

  parent    Territory?  @relation("TerritoryHierarchy", fields: [parent_id], references: [id])
  children  Territory[] @relation("TerritoryHierarchy")
  staff     TeamMemberTerritory[]
  retailers Retailer[]

  @@index([parent_id])
  @@map("territories")
}

model TeamMemberTerritory {
  id            String   @id @default(cuid())
  team_member_id String
  territory_id   String
  assigned_at    DateTime @default(now())

  team_member TeamMember @relation(fields: [team_member_id], references: [id])
  territory   Territory  @relation(fields: [territory_id], references: [id])

  @@unique([team_member_id, territory_id])
  @@index([territory_id])
  @@map("team_member_territories")
}

model SupportTicket {
  id              String       @id @default(cuid())
  retailer_id     String
  requires_visit  Boolean      @default(false)
  region_scope_id String?      // Territory.id this ticket is poolable within, when not visit-bound
  assigned_to_id  String?      // TeamMember.id, nullable until picked up
  status          TicketStatus @default(OPEN)
  note            String?

  // planned F-019 — fields used only when ticket_type = CATALOG_UPLOAD
  ticket_type            TicketType @default(GENERAL)
  item_count_requested   Int?
  quoted_price_inr       Int?
  proposed_slots         Json?      // admin-proposed visit windows, ISO datetime array
  confirmed_slot         DateTime?  // retailer's pick from proposed_slots
  razorpay_order_id      String?    // platform account (retailer pays Kanchuki), not the F-302 retailer-connected rail
  paid_at                DateTime?  // slot cannot be confirmed until this is set

  created_at DateTime  @default(now())
  resolved_at DateTime?

  retailer    Retailer    @relation(fields: [retailer_id], references: [id])
  assigned_to TeamMember? @relation(fields: [assigned_to_id], references: [id])

  @@index([retailer_id])
  @@index([status])
  @@map("support_tickets")
}

// planned F-019 — admin-editable price tiers for the paid catalog upload
// service, same pattern as plan_limits/plan_features (admin edits rows live,
// no deploy needed to change a price break)
model CatalogUploadPriceTier {
  id         String   @id @default(cuid())
  min_items  Int
  max_items  Int?     // null = open-ended top tier
  price_inr  Int

  updated_at    DateTime @updatedAt
  updated_by_id String?  // TeamMember.id — who last edited this tier

  @@map("catalog_upload_price_tiers")
}

// ─────────────────────────────────────────────
// SUBSCRIPTIONS & BILLING
// ─────────────────────────────────────────────

model Subscription {
  id          String  @id @default(cuid())
  retailer_id String
  
  plan        SubscriptionPlan
  status      SubscriptionStatus
  billing_period String // "monthly" | "annual"
  
  amount_inr  Decimal
  
  // Razorpay
  razorpay_subscription_id String? @unique
  razorpay_plan_id         String?
  
  // Dates
  current_period_start DateTime
  current_period_end   DateTime
  cancelled_at         DateTime?
  
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  
  retailer    Retailer @relation(fields: [retailer_id], references: [id])
  payments    SubscriptionPayment[]
  
  @@index([retailer_id])
  @@map("subscriptions")
}

model SubscriptionPayment {
  id              String  @id @default(cuid())
  subscription_id String
  retailer_id     String
  
  amount_inr      Decimal
  currency        String  @default("INR")
  status          String  // "success" | "failed" | "refunded"
  
  razorpay_payment_id String? @unique
  razorpay_order_id   String?
  
  // GST (18% on SaaS)
  amount_excluding_gst Decimal?
  gst_amount          Decimal?
  gst_invoice_number  String?
  
  paid_at     DateTime?
  created_at  DateTime @default(now())
  
  subscription Subscription @relation(fields: [subscription_id], references: [id])
  
  @@index([retailer_id])
  @@map("subscription_payments")
}

// VIRTUAL TRY-ON — model TryOnJob REMOVED 2026-08-31 (migration 082), then
// REBUILT 2026-09-26 for F-040
// (docs/tasks/pending/catvton-runpod-tryon-launch.md T1). The new shape is NOT
// the old one: `TryOnJob` returns with no input-photo column and a
// `customer_account_id`, plus two new customer-side quota tables
// (`customer_resource_limits`, `customer_usage_counters`), and the enums gain
// `PlanFeatureKey.VIRTUAL_TRY_ON_V2` + `QuotaResourceType.TRY_ON_GENERATION`
// (the deprecated `VIRTUAL_TRY_ON` / `TRY_ON` values stay dead). Migrations
// 118/119 carry it; see schema.prisma for the authoritative shape.
// ⚠️ Migrations 118/119 are PROPOSED, not yet applied — as of 2026-09-26 this
// section describes the schema after the owner runs them.
// F-044 R2 T7: `try_on_jobs.gpu_ms INTEGER NULL` (migration 131, APPLIED in prod
// 2026-10-17) - GPU ms per finished job (RunPod executionTime, else worker
// latency_ms); null on failed/unmetered jobs. Read by Admin -> Try-On GPU Usage.

// ─────────────────────────────────────────────
// PLAN FEATURE MATRIX (F-013, planned)
// Boolean twin of the numeric plan_limits table (F-010, already built —
// see PRO-REQUIREMENTS.md F-010). plan_limits handles counts (products,
// try-ons); PlanFeature handles on/off (360 spin, checkout, API access).
// Same admin-grid pattern, same fail behavior philosophy inverted:
// checkQuota() fails OPEN on a missing row, hasFeature() fails CLOSED.
// ─────────────────────────────────────────────

enum PlanFeatureKey {
  BULK_ONBOARDING_IMPORT
  CUSTOM_BACKGROUND_LIBRARY
  SPIN_360
  VIRTUAL_TRY_ON
  WHATSAPP_BUSINESS_API
  CHECKOUT_CART
  DATA_EXPORT_CSV
  CUSTOM_BRANDING
  GHOST_MANNEQUIN_AI
  RAZORPAY_ROUTE
  API_ACCESS
  PRIORITY_AI_QUEUE
  MULTI_STORE
}

model PlanFeature {
  id           String          @id @default(cuid())
  plan         SubscriptionPlan
  feature_key  PlanFeatureKey
  enabled      Boolean         @default(false)

  updated_at   DateTime @updatedAt
  updated_by_id String? // TeamMember.id — who last toggled this

  @@unique([plan, feature_key])
  @@map("plan_features")
}

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────

model AuditLog {
  id          String  @id @default(cuid())
  
  actor_id    String? // retailer/staff ID
  actor_type  String? // "retailer" | "staff" | "system"
  
  action      String  // "product.created" | "customer.deleted" | "collection.shared"
  resource_type String // "product" | "customer" | "collection"
  resource_id String?
  
  metadata    Json?   // before/after state for sensitive actions
  ip_address  String?
  
  created_at  DateTime @default(now())
  
  @@index([actor_id])
  @@index([resource_type, resource_id])
  @@index([created_at])
  @@map("audit_logs")
}

// ─────────────────────────────────────────────
// L2 ECOMMERCE CHECKOUT — REMOVED 2026-08-31 (migration 082).
// enums PaymentMode / RouteOnboardingStatus / OrderStatus and models
// RetailerPaymentAccount / Order / OrderItem are all gone. Subscription
// billing (Subscription / SubscriptionPayment above) is unaffected.
// ─────────────────────────────────────────────
```

---

### Add-on pack GST invoice columns (migration 163, applied 2026-11-16 by the owner; RC-173)

Pack / add-on sales (`quota_addon_purchases`) are taxable supplies and now get a GST invoice. Nine nullable columns were added: `amount_excluding_gst`, `gst_rate DECIMAL(4,4)`, `cgst_amount`, `sgst_amount`, `igst_amount`, `place_of_supply`, `sac_code`, `invoice_r2_key`, `invoice_generated_at`. `gst_amount` and `gst_invoice_number` already existed (unused until now). Read back via Supabase MCP 2026-11-16: all nine present. No new table, grant or RLS change.

- `amount_inr` is the **GST-inclusive gross** charged. The callback splits it (`computeInclusiveGst`, CGST+SGST intra-state / IGST otherwise, SAC 998314, 18%).
- Writer: `GET /v1/billing/addon-callback`, in the same transaction as the PENDING -> COMPLETED claim and the quota credit; the invoice number comes from `gst_invoice_sequences` (shared gap-free `KAN/YY-YY/NNNNNN` sequence with subscriptions) allocated inside that transaction, so a rollback burns no number. PDF: job `generate-gst-invoice` with `addon_purchase_id`; hourly backfill re-queues COMPLETED rows with a number and no PDF.
- Readers: `admin-gst`, `growth-gst`, `admin-invoices`, `retailers-invoices` merge this table with `subscription_payments` (add-ons dated by `completed_at`).
- **Never write a pack sale to `subscription_payments`:** `referral-qualify`, `referral-accrue` and the commission tracker count every `success` row there as a subscription month.
- Prod state 2026-11-16: `quota_addon_purchases`, `subscription_payments` and `gst_invoice_sequences` are all empty (no invoice has ever been issued).

### Product audience (migration 160, owner applies)

`products.audience` (`ProductAudience`: WOMEN, MEN, BOYS, GIRLS, KIDS_UNISEX) and `products.kids_age_group`
(`KidsAgeGroup`: NEW_BORN, AGE_0_2, AGE_3_5, AGE_6_8, AGE_9_12, AGE_13_16). Both nullable, no default, no index,
no CHECK. NULL audience = adult unisex or not decided.

- **Writers:** retailer product routes (`POST/PUT /v1/products`, catalog import / bulk onboarding) through
  `normalizeAudience()`, which clears `kids_age_group` unless the audience is a kids value; the `tag-product` job
  (only while the column is still NULL, never over a retailer's value); `apps/api/scripts/backfill-product-audience.ts`
  (owner-run, dry-run by default, only rows where `audience IS NULL`).
- **Reader:** My Style candidate query (`apps/api/src/lib/my-style-candidates.ts`). Rows with a stored audience are
  split by it; rows with `audience IS NULL` fall back to the `KIDS_KEYWORDS` match on category + subtype.
- **Grants/RLS:** unchanged (`kanchuki_app` already has table-level SELECT/INSERT/UPDATE on `products`).
- **Rollback:** `ALTER TABLE products DROP COLUMN audience, DROP COLUMN kids_age_group; DROP TYPE "ProductAudience"; DROP TYPE "KidsAgeGroup";`

## Indexes Strategy

### Product Search Index (Critical for Performance)
```sql
-- Full-text search on product tags (GIN index)
CREATE INDEX idx_products_tags_gin ON products USING GIN(search_tags);
CREATE INDEX idx_products_occasions_gin ON products USING GIN(occasions);

-- Vector similarity search
CREATE INDEX idx_product_embeddings_vector ON product_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- adjust based on product count

-- (customer_fashion_dna vector index removed 2026-08-31 — migration 082)
```

### Composite Indexes for Common Queries
```sql
-- Retailer's available products by category
CREATE INDEX idx_products_retailer_status_cat 
  ON products(retailer_id, status, category) 
  WHERE deleted_at IS NULL;

-- Collection analytics
CREATE INDEX idx_collection_views_collection_date 
  ON collection_views(collection_id, created_at DESC);

-- Recent enquiries per retailer
CREATE INDEX idx_enquiries_retailer_status 
  ON collection_enquiries(retailer_id, status, created_at DESC);
```

---

## Row-Level Security Policies

```sql
-- Retailers can only see their own data
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY retailer_isolation ON products
  FOR ALL TO authenticated
  USING (retailer_id = auth.uid());

-- Same pattern on: customers, collections, staff, etc.
-- Internal team access (not yet built) is scoped at the API layer, not RLS:
-- a TeamMember's session carries their assigned territory_ids, and every
-- retailer-list/detail query filters by retailer.territory_id IN (...).
-- Super Admin bypasses the filter.
-- Public read on collections (for customer web)
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_collection_read ON collections
  FOR SELECT TO anon
  USING (status = 'ACTIVE' AND deleted_at IS NULL);

-- plan_features (F-013, planned): same deny-all-except-admin pattern as
-- plan_limits and background_images — no retailer-facing policy at all,
-- read via a service-role admin API endpoint only.
ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
-- (no policies defined = default deny for authenticated/anon roles)

-- studio_styles (F-032 style catalog, planned — spec
-- docs/references/history/executed-plans/specs/2026-08-30-studio-styles-admin-design.md):
-- same deny-all pattern as background_images. Admin CRUD via the
-- service-role admin API; retailers read the plan-filtered subset via
-- GET /v1/studio-styles (the API filters status=PUBLISHED AND
-- plans has retailer.plan in the query -- no direct table access).
-- Hard delete is allowed at the admin layer (matches background_images;
-- not a BUSINESS_MODELS soft-delete table -- past generations keep their
-- provenance in ProductPhoto.metadata, no FK to studio_styles).
ALTER TABLE studio_styles ENABLE ROW LEVEL SECURITY;
-- (no policies defined = default deny for authenticated/anon roles)
```

### `studio_styles` (planned)

Admin-managed AI Studio Shoot style catalog -- replaces the hardcoded
`STUDIO_TEMPLATES` / `STUDIO_MODELS` constants. Migration `075_studio_styles`
(owner applies). Columns: `id`, `slug` (unique, == old template id),
`label`, `description`, `prompt` (server-only, never in the retailer
payload), `tab` (`StudioStyleTab`: PRODUCT | MODEL), `status`
(`StudioStyleStatus`: DRAFT | PUBLISHED | HIDDEN), `plans`
(`SubscriptionPlan[]` -- admin assigns each style to specific tiers, `[]` =
nobody), `engine` (nullable string, one of the `StudioEngine` set),
`audience` (`String[]` of `PRODUCT_DEMOGRAPHICS`), `thumbnail_url` +
`thumbnail_r2_key` (admin-uploaded sample output), `sort_order`,
`usage_count`, `created_at`, `updated_at`. Index on `status`. Seeded with
29 rows as DRAFT / unassigned.

---

## Data Retention Policy

| Data | Retention | Trigger |
|------|-----------|---------|
| Product photos | Retained while product active | Product.deleted_at marks removal |
| Collection views | 90 days | Cron cleanup of old view records |
| Audit logs | 3 years | Regulatory compliance |
| Payment records | 7 years | GST/IT compliance |
| Soft-deleted records | 30 days then hard delete | Cron cleanup |
| Deletion Vault records (F-016, planned) | Indefinite by default | Written at soft-delete time; hard-purge only via manual audited admin action, never automatic |

*(VTO/measurement photo + order retention rows removed 2026-08-31 — migration 082.)*

---

## Deletion Vault — Secondary Database (F-016, planned)

**Not part of this `schema.prisma`.** A genuinely separate Postgres instance (own provider, own credentials — NOT another schema/dataset on the same Supabase project), connected via a new `VAULT_DATABASE_URL`. Full requirements in `docs/PRO-REQUIREMENTS.md` §12.4; guardrail rationale in `docs/SECURITY.md` §19.

```prisma
// packages/db/prisma/vault-schema.prisma (separate Prisma schema, separate DB)

model DeletedRecord {
  id            String   @id @default(cuid())
  source_table  String   // "products" | "customers" | "collections" | "retailers"
  source_id     String
  retailer_id   String?
  payload       Json     // full row snapshot at time of deletion
  delete_reason String?
  deleted_by    String?  // actor id (retailer/staff/admin)
  deleted_at    DateTime @default(now())

  @@index([source_table, source_id])
  @@index([retailer_id])
}
```

The DB role behind `VAULT_DATABASE_URL` is granted `INSERT` only — no `UPDATE`, no `DELETE`, not even for the application. Once a `DeletedRecord` row is written, application code has no path to alter or remove it. This is the property that makes the vault meaningfully independent of "trust the app got the delete right" — see `docs/SECURITY.md` §19 for the full role-separation design shared with the primary DB's guardrails.

---

## DB Guardrails — Hard-Delete Protection (F-017, built 2026-07-26)

A 4-layer guardrail system prevents accidental or malicious hard-deletes of
business data. Application-layer soft-delete (`deleted_at = now()`) is the only
way to remove data through normal API paths. Full rationale:
`docs/SECURITY.md` §19.

### Layer 1 — Postgres Role Separation (infra config)

The app's runtime Postgres role (`kanchuki_app`) has `DELETE`/`TRUNCATE`/`DROP`/
`ALTER`/`CREATE` revoked entirely. A separate `kanchuki_migrator` role holds
those privileges and is **never** present in any `.env` file — human-only, via
`prisma migrate deploy`. The 30-day purge cron connects through a third,
narrowly-scoped `kanchuki_purge` role via `PURGE_DATABASE_URL` (`DELETE` on the
purge tables only, no DDL — see `scripts/setup-role-separation.sql`), so
hard-delete credentials never ride the main `DATABASE_URL`. Role-creation SQL:
`docs/SECURITY.md` §19.1.

### Layer 2 — BEFORE DELETE OR TRUNCATE Triggers (migration 037)

Even if `kanchuki_app` somehow retained DELETE privileges (misconfiguration,
role-change mistake), DB-level triggers block hard deletes as a second barrier.

**Migration:** `packages/db/prisma/migrations/037_db_guardrails/migration.sql`

**Trigger function:**
```sql
CREATE OR REPLACE FUNCTION prevent_hard_delete() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_hard_delete', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Hard delete blocked by guardrail trigger on % (F-017).
      Use soft-delete (deleted_at) or SET app.allow_hard_delete = ''true''
      for the purge cron.', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

**How it works:**
- `current_setting('app.allow_hard_delete', true)` reads a Postgres session-level
  custom variable. The second argument (`true`) means "return empty string if the
  setting is not set" instead of raising an error.
- `IS DISTINCT FROM 'true'` evaluates to `TRUE` (block the delete) when the
  setting is anything other than the literal string `'true'` — including unset
  (returns `''`), misconfigured, or set to `'false'`.
- When the setting IS `'true'`, the condition evaluates to `FALSE`, the
  `RAISE EXCEPTION` is skipped, and the trigger returns `OLD` — allowing the
  DELETE or TRUNCATE to proceed normally.
- The trigger uses `FOR EACH STATEMENT` (not per-row) — this is required for
  `TRUNCATE` compatibility, since `TRUNCATE` operates at the statement level
  and cannot fire row-level triggers.

**Tables protected:**

| Table | Trigger Name | Purpose |
|-------|-------------|---------|
| `products` | `guard_products_delete` | Protect product catalog — use `deleted_at` instead |
| `customers` | `guard_customers_delete` | Protect retailer CRM data — use `deleted_at` instead |
| `retailers` | `guard_retailers_delete` | Protect account records — use `deleted_at` instead |
| `collections` | `guard_collections_delete` | Protect collection links — use `deleted_at` instead |
| `staff` | `guard_staff_delete` | Protect staff accounts — use `is_active = false` instead |
| `product_variants` | `guard_product_variants_delete` | Protect color variants — use soft-delete instead |

*(`orders` / `order_items` guards removed 2026-08-31 — migration 082.)*

**To apply the migration:**
```bash
cd packages/db
prisma migrate deploy
```

**To bypass for the 30-day purge cron:**
```sql
SET app.allow_hard_delete = 'true';
-- Now DELETE/TRUNCATE work for this session only
-- The setting lasts only as long as the DB connection
```

The purge cron sets this flag itself inside each transaction
(`apps/api/src/jobs/purge-soft-deleted.ts`). It connects via the scoped
`kanchuki_purge` role (`PURGE_DATABASE_URL`) — the only role with `DELETE` on
the purge tables — so the flag alone is not enough to delete through the
guards: a role without the `DELETE` grant is blocked at the permission layer
before the trigger even runs, and the purge role is blocked by the trigger
unless it sets the flag.

### Layer 3 — CI Grep Guard (`scripts/check-delete-guard.sh`)

A CI script that scans for raw `.delete()` calls on business Prisma models
outside an allowlist of known-safe paths. Runs in CI (`.github/workflows/ci.yml`)
and locally. Blocks PRs that introduce:

1. `prisma.<model>.delete()` or `prisma.<model>.deleteMany()` calls in
   application code outside the allowlist (purge-cron, seed.ts, product purge
   endpoint)
2. Empty-args `deleteMany({})` (would delete ALL rows — flagged as DANGER)
3. Raw `DELETE FROM` / `DROP TABLE` / `TRUNCATE` SQL outside migration files

Allowlisted paths:
- `apps/api/src/jobs/purge-soft-deleted.ts` — 30-day purge cron (once built)
- `apps/api/src/routes/products.ts` — deliberate single-record hard-delete via
  `DELETE /products/:id/purge` (retailer-triggered, owner-only)
- `packages/db/prisma/seed.ts` — dev-only seed cleanup (never runs in production)

### Layer 4 — Deletion Vault (F-016, independent recovery backstop)

If all three layers above somehow fail (compromised `kanchuki_migrator`
credentials, a Postgres admin-level breach), the Deletion Vault at
`docs/database/DATABASE.md` "Deletion Vault" provides an independent copy of every
soft-deleted record in a separate database that even the application cannot
UPDATE or DELETE from.

### Applying Guardrails to New Tables

When adding a new business table:
1. Add a `BEFORE DELETE OR TRUNCATE` trigger in the migration:
   ```sql
   CREATE TRIGGER guard_<table_name>_delete
     BEFORE DELETE OR TRUNCATE ON <table_name>
     FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();
   ```
2. Add the Prisma model name to the `BUSINESS_MODELS` array in
   `scripts/check-delete-guard.sh`
3. Expose only soft-delete (`deleted_at`) at the API layer — never expose
   hard-delete endpoints

---

## Passport sessions — `passport_sessions.id` is a hash (H4-7, RC-154, no migration)

`passport_sessions.id` holds `sha256(<kanchuki_passport cookie value>)` as hex, never the cookie itself. All reads and writes of that column go through `hashSessionId()` in `routes/public/passport/passport-helpers.ts` (only `getPassportSession` reads, slides or deletes a row; mint and logout write by hash). Rows created before 2026-10-31 hold a raw cookie value, match no hash, and are inert; `passport_push_subscriptions.passport_session_id` may still point at them. Account-wide revocation (`passport-data.ts`) is by `customer_account_id` and is unaffected.

## Shopper nominee — `customer_accounts` (migration 108, DPDP s.14 — applied 2026-09-23)

`nominee_name TEXT NULL`, `nominee_phone TEXT NULL` — the person a shopper names to exercise their data rights on death/incapacity. Both set or both NULL (enforced in `PUT /v1/public/passport/preferences`; phone must be a 10-digit Indian mobile). Existing rows stay NULL. Included in the "Download my data" export. Nothing acts on it automatically — a nominee contacts `privacy@kanchuki.app`. No new RLS needed (existing table, same row-level policy).

## Retailer referral / affiliate program — `referral_*` (migration 109, T1)

Retailer → retailer: an existing paying retailer earns a recurring commission for bringing another retailer onto Kanchuki. Spec + task breakdown: `docs/tasks/referral-program-retailer-affiliate.md`. **T1–T7 + T9 + T10 are built (T10 = the §11 checklist run, 2026-09-23); T8 (mobile Refer & Earn) is Play-review-gated.** Migrations 109–114 are **applied (2026-09-23, owner, Supabase SQL Editor)** — the `_prisma_migrations` reconciliation INSERT still owed (see the runbook Part 1 warning). The program pays nobody until RazorpayX is provisioned (runbook Parts 2–5).

| Table | Purpose |
|---|---|
| `hsn_rules` | §6.11, migration 117. Admin-editable keyword → HSN map for WhatsApp catalog items (`keywords text[]`, `hsn` CHECK 4/6/8 digits, `sort_order`, `is_active`). First active rule by `sort_order` whose keyword appears in the product text wins; no hit → 6204. Never deleted (disable via `is_active`). Empty/unreadable → `HSN_RULES_FALLBACK` in `jobs/catalog-sync.ts`. No RLS (backend-only platform config). |
| `referral_settings` | **Singleton** (`id = 'singleton'`, same shape as `platform_gst_profile`). Every economic term — `commission_pct`, `duration_months`, `qualify_days`, `referred_bonus_type`/`_value`, `second_tier_enabled`/`_pct`, `payout_min_amount`, `payout_cadence`. Seeded by the migration so code never needs a fallback constant; admin-edited in place from `/admin/referral-settings` (T2). **Nothing here is ever a literal in application code.** |
| `referral_codes` | One shareable code per retailer (`retailer_id` unique, `code` unique). Deactivation flips `is_active` — no application hard-delete path. |
| `referral_conversions` | One row per referred retailer (`referred_id` unique → a retailer can be referred once, so a code can't double-pay). `status` PENDING → QUALIFIED → PAID / CLAWED_BACK, money in paise, `payout_id` links the batch that settled it. **Writer map:** `qualifies_at` at signup + `commission_base_amount`'s source is T4 (`lib/referral-conversions.ts`); `qualified_at` / `clawed_back_at` are written **only** by the nightly T5 cron (`jobs/referral-qualify.ts`, `0 2 * * *`); `commission_accrued` + the T6 accrual columns (`commission_monthly_paise`, `accrued_months`, `accrued_through_period`) are written **only** by the nightly T6 cron (`jobs/referral-accrue.ts`, `15 2 * * *`, migration `112`); `paid_at` by T7 — it is the date the **referrer was paid out**, not the date the referred store paid, and the CHECK forbids it on a QUALIFIED row (RC-033 note: the webhook's collapse of `subscription.completed` into `CANCELLED` is why T5's churn branch cannot distinguish completion from churn). **T6 accrual invariants (migration 112 CHECKs):** `accrued_months = 0` ⟺ no cursor ⟺ no frozen amount; PENDING rows never accrue; `commission_accrued = accrued_months × commission_monthly_paise` — the ledger cannot drift from its own parts. Accrual model (owner decisions 2026-09-23, full detail in the job header): base = T5's snapshot, monthly installments on the daily cron, only months with a successful payment earn (unpaid months skipped, never clawed back; program ends at `duration_months` **earned**), amount frozen at first earn. |
| `referral_payouts` | One batch per referrer per cadence period. `idempotency_key` unique (retried cron can't double-pay), `razorpayx_payout_id` unique, `webhook_confirmed` + timestamp. Never deleted by application code — a bad batch is marked FAILED/REVERSED. **Writer map (T7, 2026-09-23):** rows are created **only** by `jobs/referral-payout.ts` (`30 2 30 * *` — owner decision: monthly on the 30th) at claim time, with the idempotency key **pre-generated inside the claim transaction** (`refpo-` + `crypto.randomBytes(12)` — a create-then-update placeholder would collide on the UNIQUE key under overlapping claims). `status` PENDING → PROCESSING → PAID / FAILED / REVERSED transitions are written **only** by `lib/referral-payout-settle.ts` `settlePayout()` — imported by BOTH the job's reconciliation step and the payout webhook, so there is exactly one settlement path. `tds_paise` (migration `114`) is snapshotted at claim; `amount_paise` stays GROSS while RazorpayX receives net = gross − TDS when the admin has TDS on. |
| `referral_payout_accounts` | (T7, migration `113`, **applied 2026-09-23** by the owner, Supabase SQL Editor; migration `115` **applied 2026-09-23**, verified by `scripts/check-referral-migrations.ts` — converts `account_type` to the `referral_payout_account_type` enum Prisma already expects (113's TEXT column made every save fail) and drops the unused raw `bank_details`/`vpa_address` columns) One row per retailer (unique `retailer_id`), the self-serve payout destination. Stores **only RazorpayX identifiers** (`contact_id`, `fund_account_id`), the fund-account type (`VPA` or `BANK_ACCOUNT`), and a masked display (`priya@ybl` / `XXXX1234 · HDFC`) — raw bank/UPI details are never persisted; the Contact + Fund Account are created at save time. `is_active` deactivates (no hard delete, house rule). Purge-swept before `DELETE FROM retailers` (RC-030 discipline, both purge jobs updated). **Writers (T9, 2026-09-23):** `PUT /v1/retailers/me/payout-account` (retailer self-serve) **and** `PUT /v1/admin/referral/retailers/:id/payout-account` (admin interim entry until T8) both call the same `lib/referral-payout-account-save.ts` — one save path, two callers, no drift. Admin reads via `GET /v1/admin/referral/retailers/:id/payout-account`. |

**Deliberately not the removed engine.** The customer-facing "Referral Program Engine" was dropped by migration 082 (`referrals`, `referral_credits`, `partner_referrals`, enums `ReferralCreditStatus`/`PartnerReferralStatus`, `retailers.referral_enabled`/`referral_reward_paise`). None of those identifiers are reused. This is also distinct from F-018's internal-team codes (`TeamMember.referral_code` → `retailers.onboarded_by_id`) — separate ledgers.

**Constraints carry the invariants.** Prisma cannot express `CHECK`, so these are DB-only (they won't show as drift in `prisma migrate diff`): commission/pct ranges, `second_tier_enabled` ⇒ `second_tier_pct`, the `referred_bonus_type`↔`referred_bonus_value` unit pairing, no self-referral, conversion `status`↔transition-timestamp agreement, positive payout amount, and `webhook_confirmed`↔timestamp agreement. Rationale: an enum-like config value the code doesn't understand must fail loudly rather than silently no-op (RC-027).

**Purge wiring (load-bearing).** All three retailer FKs are `ON DELETE RESTRICT`, which makes them retailer *children*. Both `apps/api/src/jobs/purge-soft-deleted.ts` and `purge-retailer-now.ts` therefore delete them **before** the retailer row, and migration 109 grants `DELETE` to the scoped `kanchuki_purge` role (same shape as migration 084). Omitting either half reproduces the `product_attributes`/`social_accounts` bug: `DELETE FROM retailers` throws an FK violation and the entire purge transaction rolls back silently. Any future table with a RESTRICT FK to `retailers` needs both. `referral_settings` is exempt — a global singleton, never deleted.

**The opposite failure mode, for contrast (RC-030).** A **declared** FK fails loudly when the purge list misses it. A denormalised `retailer_id` (bare `String`, no `@relation` — used for query convenience on `product_videos`, `campaigns`, `customer_interactions`, …) fails **silently**: Postgres neither cascades nor errors, so the rows simply survive the delete. This had happened to **7 of the 13** bare-`retailer_id` models; all seven are now swept by both purge jobs, and the list is no longer trusted by hand — `apps/api/src/jobs/purge-soft-deleted.test.ts` derives the requirement from this schema (bare `retailer_id` **without** a `Retailer` relation, i.e. nothing can cascade to it) and fails naming any table either job misses. `product_videos` is the one apparent exception and is not one: its `product_id` FK to `products` is `ON DELETE CASCADE`, so the product sweep already carries it away. ⚠ Four of the seven (`customer_interactions`, `consent_events`, `customer_recently_viewed`, `customer_wishlist_items`) have RLS enabled and `kanchuki_purge` is created without `BYPASSRLS` — RLS filters rather than raising, so those sweeps deleted 0 rows silently until **migration `111_backend_role_rls_policies`** named the backend roles in a `FOR ALL` policy. It was never just those four: 23 of the 32 tables the purge path deletes from are RLS-enabled and none had a backend policy, so the whole path depended on `kanchuki_purge`'s membership in whichever role happened to own each table (`pg_class_ownercheck`), which is why the failure could not be settled by reading code. A new RLS-enabled table on the purge path now needs an entry in migration 111 as well as a sweep and a grant — `apps/api/src/jobs/purge-rls-policy.test.ts` derives the requirement from this schema and fails if the two lists drift in either direction. The rule that follows: a new `retailer_id` column without a relation is still a purge-list change and must ship with the sweep, exactly like a RESTRICT FK. See RC-030.

No RLS: post-Railway tables rely on app-layer tenant scoping through the privileged app role (the zero-policy deny-all pattern breaks the pooled Prisma read path — see migration 099's header).

## Support-session grants — `support_session_grants` (migration 127, written 2026-10-15, NOT yet applied)

Retailer consent record for a Kanchuki-staff support session (`docs/tasks/pending/support-session-access.md`).
One row per session: `ticket_id`, `retailer_id`, `team_member_id`, `scope` (`DEMO|GROWTH|MAINTENANCE`),
`status` (`PENDING|APPROVED|DENIED|REVOKED`), `requested_at`, `decided_at`, `expires_at` (set at approval,
decided_at + 24 h, never extended), `revoked_at`, `revoked_by` (`RETAILER|STAFF|ADMIN`).
`TicketType` gains `DEMO`, `GROWTH_SETUP`, `MAINTENANCE`.

- **Never deleted by the app** — audit record; ending a session = `REVOKED`. `kanchuki_app` has no DELETE
  (no caller, so RC-049 does not apply); `kanchuki_purge` has DELETE for the retailer hard-delete path.
  FKs: ticket/retailer `ON DELETE CASCADE`, team_member `RESTRICT`.
- RLS on, one `backend_roles_full_access` policy for `kanchuki_app`/`kanchuki_purge` (same shape as 126).
- Writer map: `routes/team/team-support-sessions.ts` (`transitionGrant`, create), `routes/support-sessions.ts`
  (retailer approve/deny/revoke via `transitionGrant`), `routes/admin-settings/support-sessions.ts` (admin kill).
  All status changes go through `transitionGrant` (status-guarded `updateMany`). Global switch =
  `support_sessions_enabled` in the admin settings KV (audit-log store), default OFF, fails closed.

## Staff push devices — `staff_push_devices` (migration 135, F-046, written 2026-10-19, NOT yet applied)

Expo push tokens registered by the retailer app so new enquiries can ping the team.
Columns: `id`, `retailer_id` (FK `retailers`, `ON DELETE CASCADE`), `staff_id` (nullable; null = the owner's own
login; deliberately **no FK** — recipients are resolved from `Staff.role`/`is_active` at send time),
`expo_token` (UNIQUE, `ExponentPushToken[...]`), `platform` (`android|ios`, CHECK), `last_seen_at`, `disabled_at`,
`created_at`. Index `(retailer_id, disabled_at)`.

- **No DELETE from the app** (RC-049): unregister and Expo `DeviceNotRegistered` set `disabled_at`; a
  re-register upserts the same token back to active and moves it to the new retailer/staff. `kanchuki_app` gets
  SELECT/INSERT/UPDATE by default privileges. `hardDeleteRetailer()` does NOT list the table (RC-050 is satisfied
  by the `retailer_id` FK being `ON DELETE CASCADE`; naming it there would trip the RC-030 `purge-rls-policy`
  guard, which ties purge-touched tables to migration 111's list). `kanchuki_purge` still gets DELETE as belt-and-braces.
- RLS on, one `backend_roles_full_access` policy for `kanchuki_app`/`kanchuki_purge` (policy first, then ENABLE — RC-030).
- Writer map: `routes/push-devices.ts` (`/v1/push-devices/register`, `/unregister`); `jobs/enquiry-push.ts` (`disableTokens`, soft-disable on Expo `DeviceNotRegistered`, queue `kanchuki-push`).
- No customer data is stored or sent: push payloads carry an enquiry id and item count only.

## Customer push subscriptions — `customer_push_subscriptions` (migration 138, F-036 Phase B, written 2026-10-25, NOT yet applied)

One Web Push subscription per browser, owned by a verified passport account. Columns: `id`, `customer_account_id`
(FK `customer_accounts`, `ON DELETE CASCADE`), `passport_session_id` (FK `passport_sessions`, `ON DELETE SET NULL`; the
session that subscribed — a push needs it unrevoked and unexpired, so logout stops that device), `endpoint` (UNIQUE, push-service URL), `p256dh`, `auth`,
`last_seen_at`, `disabled_at`, `created_at`. Index `(customer_account_id, disabled_at)`.

- Which stores may notify a subscription is not stored: resolved at send time from `customer_store_visits`
  (visited and `is_muted = false`).
- **No DELETE from the app** (RC-049): unsubscribe, passport delete and a 404/410 from the push service set
  `disabled_at`; a re-subscribe of the same endpoint upserts it back to active and to the account signed in now.
  `kanchuki_purge` gets DELETE as belt-and-braces.
- RLS on, one `backend_roles_full_access` policy for `kanchuki_app`/`kanchuki_purge` (policy first, then ENABLE — RC-030).
- Writer map: `routes/public/passport/passport-push.ts` (subscribe/unsubscribe), `passport-data.ts` (delete disables
  all), `jobs/customer-push.ts` (soft-disable on 404/410).
- Push payload: shop name, product count, storefront path. No shopper data.

## Product stock — `product_stock` (migration 137, written + applied 2026-10-24)

Per-size stock. One row per `(product_id, size)`; `size` is a `SIZE_OPTIONS` value or `FREE` for unsized items. Columns: `id`, `product_id` (FK `products`, `ON DELETE CASCADE`), `retailer_id` (FK `retailers`, `ON DELETE CASCADE`), `size`, `quantity` (CHECK `>= 0`), `updated_at`. UNIQUE `(product_id, size)`, index `retailer_id`.

- A product with no rows is "not tracked" and behaves as before; no backfill.
- **No DELETE from the app** (RC-049): removing a size writes quantity 0. `kanchuki_purge` gets DELETE as belt-and-braces. Both FKs cascade, so `hardDeleteRetailer()` needs no list entry (RC-050).
- RLS on, one `backend_roles_full_access` policy for `kanchuki_app`/`kanchuki_purge` (policy first, then ENABLE — RC-030).
- Writer map: `lib/product-stock.ts` (`writeStock`, `zeroStock`) called from `routes/products/products-crud.ts` and `lib/catalog-import.ts`.

## Scan & Sell ledger — `product_sales` (migration 158, F-047, written + applied 2026-11-14 by the owner; read back: `kanchuki_app` SELECT/INSERT/UPDATE only, `kanchuki_purge` DELETE, RLS on, policy `backend_roles_full_access`)

One row per `(bill, product, size)` sold at the counter. Columns: `id`, `retailer_id` (FK `retailers`, `ON DELETE CASCADE`), `bill_id` (phone-made uuid), `product_id` (FK `products`, `ON DELETE CASCADE`), `size` (`SIZE_OPTIONS` value or `FREE`), `quantity` (CHECK `> 0`), `unit_price` (paise snapshot of `price_min`, nullable), `sold_by_staff_id` (`Staff.id`, NULL = owner; **plain column, no FK**, so a staff row never blocks history or purge), `undone_at` (nullable), `undone_by_staff_id` (`Staff.id` of whoever undid it, NULL = owner; plain column, no FK; **migration 159, written 2026-11-14, applied in prod (owner confirmed 2026-11-15, not read back by me)**; rows undone earlier keep NULL), `created_at`. UNIQUE `(retailer_id, bill_id, product_id, size)` is the durable idempotency guard (retailer-scoped because `bill_id` comes from the phone); indexes `(retailer_id, created_at)`, `product_id`.

- **No DELETE from the app** (RC-049): Undo sets `undone_at` and adds the stock back. `kanchuki_app` gets an explicit `SELECT, INSERT, UPDATE` (RC-162: default privileges were found missing on prod); `kanchuki_purge` gets DELETE as belt-and-braces. Both FKs cascade, so `hardDeleteRetailer()` needs no list entry (RC-050).
- RLS on, one `backend_roles_full_access` policy for `kanchuki_app`/`kanchuki_purge` (policy first, then ENABLE — RC-030).
- Writer map (T3 + T4 built; Undo claims a row with `UPDATE ... WHERE undone_at IS NULL`, never deletes): `POST /v1/products/sell` inserts rows and decrements `product_stock`; `POST /v1/products/sell/:billId/undo` sets `undone_at` + `undone_by_staff_id` (same claim `UPDATE`, so the actor belongs to the request that won it) and restores stock. Redis key `sell:{retailer_id}:{bill_id}` (24 h) is a fast first check only; this UNIQUE is the source of truth.
- Pinned by `apps/api/src/lib/product-sales-migration.test.ts`.

## Social post scheduler — `post_schedule_plans`, `scheduled_posts`, `scheduled_post_items` (migrations 128/129, F-043, written 2026-10-15, NOT yet applied)

| Table | Purpose | Notes |
|---|---|---|
| `post_schedule_plans` | One posting plan per social account: weekdays (IST), `post_time` `HH:mm`, per-weekday `batch_ranges`, source, horizon, `status` DRAFT/ACTIVE/PAUSED/ENDED, `pause_reason` | FKs → `retailers`, `social_accounts` (both CASCADE). Never hard-deleted. |
| `scheduled_posts` | One post per day slot: `scheduled_at` (UTC), `caption`, `status` DRAFT/READY/PUBLISHING/POSTED/FAILED/MISSED/SKIPPED, `attempts`, `error`, `client_post_id`, `social_post_id` | UNIQUE `(retailer_id, client_post_id)`; index `(status, scheduled_at)` for the Task 2 tick. Never hard-deleted. |
| `scheduled_post_items` | Slides: `product_id`, `position` 0–9, `image_level` ORIGINAL/TEMPLATE, `photo_id`, Task 4 `template_id`/`resolved_image_key` | UNIQUE `(scheduled_post_id, position)`. **Only table with `DELETE` granted to `kanchuki_app`** (slide Remove; RC-049, migration-125 "Option A" reasoning). |

- **RLS:** all three enabled with a `backend_roles_full_access` policy for `kanchuki_app` + `kanchuki_purge` (policy first, then ENABLE — RC-030). Retailer scoping is in the API (every query carries `retailer_id`).
- **Enums (128, separate file — 55P04):** `PlanFeatureKey.SOCIAL_SCHEDULER` (fails closed), `QuotaResourceType.SCHEDULED_POST`, `QuotaResourceType.ACTIVE_SCHEDULE_PLAN`. Tables use new enums `SchedulePlanStatus`, `ScheduledPostStatus`, `ScheduleImageLevel`.
- **Seeds (129):** `plan_features` SOCIAL_SCHEDULER=true ×3 plans; `plan_limits` SCHEDULED_POST=-1/MONTH ×3, ACTIVE_SCHEDULE_PLAN=1/LIFETIME ×3.
- **Purge (RC-050):** every FK into `retailers`/`products` is `ON DELETE CASCADE`, so `hardDeleteRetailer()`'s list needs no new entries. Pinned by `apps/api/src/lib/post-scheduler-migration.test.ts`.

## My Style — `color_families`, `style_palettes`, `style_trends` + new columns (migrations 132/133, F-045 PR-1, written 2026-10-17, applied 2026-10-17 by the owner via the Supabase SQL editor — 132 and 133 as two separate runs, 55P04; verified: 22 families, 9 palettes, `STYLE_ANALYSIS` limit 3/MONTH, RLS on all three tables)

| Table | Purpose | Notes |
|---|---|---|
| `color_families` | Canonical colour family (`name`, lowercase) + `aliases[]` ("Mustard", "Haldi" → `yellow`). 22 seeded | UNIQUE `name`, CHECK `name = lower(name)`. `is_active`; never hard-deleted. |
| `style_palettes` | `good_families[]` / `avoid_families[]` per `(undertone, depth, version)`. 9 seeded (3 × 3) | UNIQUE `(undertone, depth, version)`; CHECKs on undertone `warm/cool/neutral`, depth `fair/medium/deep`. Array elements are `color_families.name` — not FK-able; validated in `apps/api` and the seed is pinned by test. |
| `style_trends` | Admin trend boosts (`label`, `kind`, `match_keywords[]`, `boost` 0–1, `starts_at`/`ends_at`). Empty at launch | Read by PR-10. `kind` is free text until PR-10 defines it. |
| `style_analysis_daily` | **Migration 134 (PR-8, written 2026-10-18, NOT yet applied).** One row per UTC day: `day` DATE (PK), `count`, `updated_at`. Admin usage chart. **No customer id on purpose** (a per-person log would record who sent a selfie). | CHECK `count >= 0`. RLS: backend-roles policy, same shape as 133. No DELETE granted or needed. |

- **New columns (all nullable, no default → no table rewrite):** `products.color_family` (+ index `products_color_family_idx`; set by PR-2, NULL = unmapped); `customer_accounts.skin_undertone`, `skin_depth`, `body_frame` (CHECK-constrained values), `style_profile_at`. **Derived profile only — the photo is never stored.** "Clear my data" = `UPDATE … SET … = NULL`. **Migration 161 (2026-11-16, NOT applied by the agent):** `customer_accounts.height_cm`, `bust_cm`, `waist_cm`, `hip_cm` (CHECK ranges), `measurements_at` — self-entered by the shopper via `POST /v1/public/my-style/measurements`, shopper-only; every derived/collected My Style column is nulled together by `STYLE_PROFILE_CLEARED` (`lib/my-style-consent.ts`) from `profile/clear`, the analysis job's compensation and `POST /passport/delete` (RC-172). **Migration 162 (2026-11-16, NOT applied by the agent):** `products.size_chart` JSONB, nullable, retailer-entered cm ranges per size, validated by `parseSizeChart`; read only by My Style's size label.
- **Enum (132, separate file — 55P04):** `QuotaResourceType.STYLE_ANALYSIS`. 133 seeds `customer_resource_limits` `STYLE_ANALYSIS` = 3 / `MONTH` (`ON CONFLICT DO NOTHING`, so an admin edit survives a re-run; `checkCustomerQuota` fails open without it).
- **RLS:** all three tables enabled with a `backend_roles_full_access` policy for `kanchuki_app` + `kanchuki_purge` (policy first, then ENABLE — RC-030). Global config: no `retailer_id`, no customer link.
- **No DELETE granted** on any of them (RC-049): admin "remove" = `is_active = false`. Default privileges give `kanchuki_app` SELECT/INSERT/UPDATE.
- **Purge (RC-050):** no FK into `retailers` / `products` / `customer_accounts`, so `hardDeleteRetailer()`'s list needs no entry.
- **Writer map:** `products.color_family` (PR-2, built 2026-10-17) ← three writers, all via `normalizeColorFamily()` (`packages/shared/src/color-family.ts`: exact name/alias, else whole-word keywords with longest-match-wins; two families found or none → NULL, never guessed) over the **active** `color_families` rows (`lib/color-families.ts`, 60 s in-process cache): `jobs/tag-product.ts` (every tag/re-tag overwrites it, so it never trails `primary_color`), `PUT /v1/products/:id` (only when `primary_color` is in the edit), and `jobs/color-family-backfill.ts` (weekly cron `30 7 * * 0`, no `repeat.limit`; fills only `color_family IS NULL AND primary_color IS NOT NULL`, with `AND color_family IS NULL` re-checked in the write; throws if the family lookup fails or none are active). Tag/PUT lookup failures leave it NULL and log `[color-family] lookup failed` — the backfill is the repair. `color_families` ← `routes/admin/admin-color-families.ts` (`/v1/admin/color-families`; list/create/edit aliases/`is_active`; name immutable; no DELETE; a term may belong to one family only; classified standard-admin in `admin-access.ts`). `skin_undertone` / `skin_depth` / `body_frame` / `style_profile_at` (PR-6, built 2026-10-18) ← one writer, `jobs/my-style-analyze.ts` (Claude Vision, enum-validated; UPDATE only when a profile was produced), and nulled by `clearStyleProfile()` (`lib/my-style-consent.ts`) from two callers: `POST /v1/public/my-style/profile/clear` and the job itself when it loses a race to that route. Job state lives in Redis (`mystyle:job:{id}` 15 min, `mystyle:inflight:{account}` 3 min), not in a table. `style_palettes` / `style_trends` ← `routes/admin/admin-my-style.ts` (PR-8, built 2026-10-18; palettes edit-only with `version` bump, trends create/edit, no DELETE; standard-admin segment `my-style`). `style_analysis_daily` ← one writer, `jobs/my-style-analyze.ts` (upsert count+1 per UTC day, best-effort, only when a profile was produced); read by `GET /v1/admin/my-style/usage` (Super Admin only).
- **Writer map (PR-3b):** `customer_accounts.pref_occasions / pref_styles / pref_fabrics / pref_colors / budget_min / budget_max` also have a second writer, `PATCH /v1/public/passport/style-quiz` (`routes/public/passport/passport-style-quiz.ts`), alongside `PUT /passport/preferences`. It maps the quiz labels in `packages/shared/src/style-quiz.ts` (`mapStyleQuizAnswers`), writes only the keys sent, and the budget is paise. Region is stored in `pref_styles`; a colour with no family (e.g. "Pastels") is kept as its own lowercase term in `pref_colors`. Reads only (no writes): `POST /v1/public/my-style/feed` (`routes/public/public-my-style.ts`) reads `products`, `retailers`, `style_palettes` and the `customer_accounts` pref/skin columns.
- **Pinned by** `apps/api/src/lib/my-style-migration.test.ts`: enum-only 132, additive-only 133, RLS order, no GRANT/DELETE, seeds load, every palette references only known families, good ∩ avoid = ∅.

## Google Business Profile + setup checklist — `gbp_links`, `gbp_reviews`, `support_tickets.setup_item`, `retailers.setup_dismissed` (migrations 140–143, written 2026-10-26, NOT yet applied)

Apply order **139 → 140 → 141 → 142 → 143**, each as its own run (140 adds enum values that 142 uses: PG 55P04, same split as 128 → 129). Every file is idempotent. Spec: `docs/tasks/pending/google-business-profile-and-setup-checklist.md`.

- **140** enum values only: `IntegrationCategory.GOOGLE`, `PlanFeatureKey.GOOGLE_BUSINESS_PROFILE`, `QuotaResourceType.GBP_REVIEW_REPLY`. Postgres cannot drop an enum value; they are inert without rows.
- **141** `gbp_links` (one row per retailer, unique on `retailer_id`; unique on `(gbp_account_id, gbp_location_id)` so a Google location belongs to one retailer; CHECK: `LINKED` requires both ids) and `gbp_reviews` (unique on `(link_id, google_review_id)`, CHECK `star_rating` 1–5). Both FK `retailers` ON DELETE CASCADE (retailer hard-delete needs no list entry, RC-050). RLS on, policy `backend_roles_full_access` for `kanchuki_app`/`kanchuki_purge`; `kanchuki_purge` holds DELETE on `gbp_reviews` only, the app role has no DELETE (RC-049).
- **142** `plan_limits` rows for `GBP_REVIEW_REPLY` (Starter 20 / Growth 100 / Pro 500 per month, `ON CONFLICT DO NOTHING`). **No** `plan_features` row on purpose: the feature fails closed (OFF) until an admin enables it per plan.
- **143** `support_tickets.setup_item TEXT` (which checklist item an "Ask Kanchuki team" ticket is for; NULL on ordinary tickets), `retailers.setup_dismissed TEXT[] NOT NULL DEFAULT '{}'` (hides items only; status is derived from real data), partial unique index `support_tickets_open_setup_item_key` on `(retailer_id, setup_item)` WHERE `setup_item IS NOT NULL AND status IN ('OPEN','ASSIGNED')`.
- **Writer map:** `gbp_links.status/consented_at` ← `POST /v1/retailers/me/google-business/request` (REQUESTED, ids cleared) and `DELETE …/link` (UNLINKED) in `routes/retailers/retailers-google-business.ts`. `gbp_account_id`, `gbp_location_id`, `location_title`, `linked_*` ← **only** `routes/admin/admin-gbp.ts` (`/v1/admin/gbp/links/:id/link|unlink`; the location is re-checked against what the shared Google identity lists, never the client's ids). `last_synced_at`, `last_error_code`, `avg_rating`, `review_count`, `NEEDS_ACCESS` ← `lib/gbp-sync.ts` (`syncLink`, called by the admin link action, the on-demand refresh in `GET …/reviews` via a CAS on `last_synced_at`, and the 6-hourly `jobs/gbp-review-sync.ts`). `gbp_reviews` rows ← `syncLink` (upsert) and the reply route (`reply_comment`, only after Google confirmed); deleted **only** by `purgeOldReviews()` in `jobs/gbp-review-sync.ts` through the purge client (30 days after unlink, and rows from a previous location after a re-link). `support_tickets.setup_item` ← `createRoutedTicket` in `routes/retailers/retailers-tickets.ts` (callers: `POST /me/setup-checklist/:item_key/ask`, `POST /me/google-business/request`); read by `GET /v1/team/tickets`. `retailers.setup_dismissed` ← `POST /me/setup-checklist/dismiss|restore`. The shared Google identity's refresh token and "API approved" flag live in `integration_settings` (category `GOOGLE`, encrypted), written only by Super Admin routes in `admin-gbp.ts`.
- **Dropped by migration 146 (2026-10-31):** the six `retailers.gmb_*` columns (legacy token-paste GMB, removed from code in RC-101) are removed from `schema.prisma`; `146_drop_gmb_columns` drops them with `IF EXISTS`. Owner checked prod first: no row held a value in any of them. NOT applied by the agent.
- **Dropped by migration 156 (2026-11-14):** table `social_templates` and enum `SocialTemplateType` (retired AI social-template feature, code removed 2026-11-05) are removed from `schema.prisma` and `purge-retailer-now.ts`; `156_drop_social_templates` uses `DROP ... IF EXISTS`. `PlanFeatureKey.SOCIAL_TEMPLATES` stays (enum values cannot be dropped cheaply). Earlier migrations (069, 124, 125, 136, 150) still name the table as applied history. Applied in prod by the owner 2026-11-14 (row count was 0, no dump; `to_regclass('social_templates')` returned null afterwards). The agent did not apply it.
- **Backfilled by migration 147 (2026-11-01, RC-159):** `retailers.latitude`, `retailers.longitude` (+ index `retailers_latitude_longitude_idx`) and `bug_reports.resolved_at` were in `schema.prisma` and read by code but created by no migration. `147_backfill_drift_columns` adds them with `IF NOT EXISTS`. NOT applied by the agent. `SocialPostStatus` `SCHEDULED` / `DRAFT` come from migration 090; `schema.prisma` now lists them.

## Queued-job quota reservations — `quota_reservations` (migration 144, RC-102 follow-up, written 2026-10-27, applied in prod 2026-10-27 by owner: "Success. No rows returned")

**Status update 2026-10-31:** migration 145 (`product_photos_studio_job_id_idx`, the sweep's expression index) is applied in prod per the owner; not re-queried by the agent. Migration 144 is as recorded below.

Which queued job holds which quota slot, so a refund keyed by `job_id` is idempotent. The counters (`usage_counters`, later `customer_usage_counters`) stay the number the limit is checked against; this table only records the holder. Spec: `docs/tasks/pending/quota-reserve-at-enqueue.md`. 144 is applied, so the reserving code and the sweep can deploy.

Columns: `id`, `job_id` (the payload id, not BullMQ's), `retailer_id` XOR `customer_account_id` (CHECK; both FKs `ON DELETE CASCADE`, so `hardDeleteRetailer()` needs no list entry, RC-050), `resource_type`, `period_start` (the counter row it bumped), `amount` (CHECK `> 0`), `state` (CHECK `RESERVED | SPENT | REFUNDED`), `created_at`, `refunded_at`. Partial unique indexes on `(job_id, resource_type)` per scope (a shopper try-on later holds one retailer row and one customer row for one job), plus a partial index on `created_at WHERE state = 'RESERVED'` for the not-yet-built sweep.

- RLS on, one `backend_roles_full_access` policy (policy first, then ENABLE, RC-030). No DELETE grant and none needed: a refund is an UPDATE (RC-049).
- **Writer map:** `lib/quota.ts` only. `reserveJobQuota` (one CTE: guarded counter upsert + reservation INSERT), `refundJobQuota` (flip RESERVED to REFUNDED and decrement the counter for that row only), `markJobQuotaSpent`. Callers: `routes/products/products-studio.ts` (reserve, refund if the enqueue throws), `jobs/studio-shoot.ts` (mark spent when a photo exists, refund in `finally` otherwise), the studio worker's `failed` hook in `jobs/index.ts` (stalled backup). Unlimited plans (no limit row or `-1`) write no row.
- **Writers (2026-10-27):** retailer scope = studio-shoot (`products-studio`, `growth-social-templates` generate) and try-on; customer scope (`customer_account_id`, counter `customer_usage_counters`) = try-on shopper cap and My Style analyze. A shopper try-on holds two rows for one `job_id` (one per scope).
- **Sweep (2026-10-27):** hourly maintenance job `quota-reservation-sweep` (`jobs/quota-reservation-sweep.ts`, `:40`) settles `RESERVED` rows older than 6 h: a job that left a paid result (studio: a `product_photos` row with `metadata.studio.job_id`; try-on: `try_on_jobs.gpu_ms` set or `COMPLETED`) is marked `SPENT`, anything else is refunded. My Style has no durable trace (Redis, 15 min), so its stuck rows are always refunded. Tests only, not run against real Postgres.
- **Review fixes (2026-10-27):** (a) a try-on that fails after the GPU ran (e.g. R2 save throws) now writes `gpu_ms` on its `FAILED` row, so the sweep marks a still-`RESERVED` slot `SPENT` instead of refunding a paid run (`jobs/tryon.ts`); the `failed` hooks in `jobs/index.ts` now refund only for a stalled-out job (`/stalled/i` on the BullMQ error), since a handler-thrown error has already settled its slot. (b) The sweep's studio lookup is raw SQL on `metadata #> '{studio,job_id}'`, served by migration **145** (`product_photos_studio_job_id_idx`, expression index; **NOT applied, owner applies**; measured on a scratch DB: 52 ms seq scan -> 0.11 ms at 100k rows). Until 145 is applied the lookup still works, as a seq scan per stuck row.
- **Known gap left:** a My Style read whose mark-spent write failed is refunded by the sweep (no durable trace to read).
- **Not built:** tagging (left on check-then-increment).

## Migrations Strategy

- All schema changes via Prisma migrations (`prisma migrate dev`)
- Breaking changes: never drop columns in-place — deprecate first, migrate data, then drop
- Zero-downtime: add nullable columns, then backfill, then add NOT NULL constraint
- See `skill://database-migrations` for full patterns

---

## Database Structure Report — 2026-08-22

> Merged from the former `docs/database/db-structure-report-2026-08-22.md`.


### What you asked

> Check Supabase DB — tables, fields, columns, entries, IDs, unique keys, relationships. Can we merge tables, link them to one main table? How many tables, what's each table's role? Admin login should get reports from every section; retailer has own table tied to retailer ID, admin tied to admin ID, customer tables linked to admin main table and to retailers. Is the DB structure 100% fine? Want 9-12 tables minimum, 21 max, rest added later as features grow. Rate it — good, bad, sounds good, excellent?

Answered as 2 points first (in chat), full detail here.

### #1 — Table count and relationships

**73 tables** (Prisma models in `packages/db/prisma/schema.prisma`, 2465 lines), **51 enums**, backed by Postgres on Supabase.

#### Hub structure — not flat, not siloed

`Retailer` is the hub. **51 of the 73 tables carry a direct `retailer_id` foreign key** — every retailer-scoped feature (products, customers, collections, orders, campaigns, suppliers, bookings, referrals, social posts, catalog sync, integrations...) hangs directly off `Retailer.id`. Deeper chains extend from there:

```
Retailer (hub)
├── Product ──── ProductPhoto, ProductVariant, ProductSpinFrame, ProductEmbedding, ProductVideo, ProductReview
├── Customer ──── CustomerVisit, CustomerMeasurement, CustomerFashionDNA, CustomerInteraction
├── Collection ── CollectionProduct, CollectionView, CollectionEnquiry
├── Staff, TeamMember ── TeamMemberTerritory, Territory
├── Order ──── OrderItem
├── Subscription ── SubscriptionPayment
├── Campaign ── CampaignSend, Festival
├── Supplier ── SupplierTransaction
├── Referral ── ReferralCredit
├── Partner ── PartnerReferral, PartnerEvent
├── TryOnJob, TrainingPhotoConsent, TryOnUsageLog
├── AiProviderConfig ── AiUsageLog
├── SocialAccount ── SocialPost
├── CatalogItem ── CatalogSyncLog
└── ... (51 total direct children, 73 total incl. grandchildren + platform tables)
```

`Customer` (15 references across the schema) is itself a sub-hub under `Retailer` — `CustomerVisit`, `CustomerMeasurement`, `CustomerFashionDNA`, `CustomerInteraction` all key off `customer_id`, and `Customer` keys off `retailer_id`. This matches what you described wanting ("customer tables linked to retailers") — it's already built that way.

#### The gap: no `Admin` table

You described admin login being tied to an "admin ID" the way retailer/customer are. **That doesn't exist.** Admin auth is env-var based — `ADMIN_EMAIL` / `ADMIN_PASSWORD` on the API service (see `apps/api/src/routes/admin-auth.ts`), not a database row. `CLAUDE.md` build-log entry #21 calls this out explicitly as intentional: *"Admin panel refresh→login + CSRF 403 fix (DB-free session check)"*. It works, but it means:
- No per-admin audit trail tied to a real foreign key (there's an `AuditLog` table, but it isn't FK'd to an `Admin.id` because there's no such row to point at)
- Can't have multiple named admins with different permissions without adding a real `Admin` table
- "Admin gets all reports from every section" already works today (every table keys off `retailer_id`, so `SELECT ... GROUP BY retailer_id` or similar rollups work fine across all 51 retailer-scoped tables) — that part of your ask is already satisfied structurally, just not gated behind a DB-backed admin identity

#### Unique keys / IDs

Every table uses `id String @id @default(cuid())` — collision-safe, sortable-ish, no auto-increment integer exposure (good practice, avoids enumeration attacks on public routes). Natural-key uniqueness is enforced separately where it matters, e.g. `Retailer.phone` unique, `Retailer.auth_user_id` unique (both confirmed live in `auth.ts` — the whole soft-delete/relink dance in the OTP flow exists *because* of this constraint).

### #2 — Can this fit in 12-21 tables?

**No — and forcing it would make the database worse, not simpler.**

73 tables for 52 shipped features (see the feature index in `CLAUDE.md` — growth engine with campaigns/referrals/suppliers/bookings/inventory alerts, marketing suite with social publishing/lookbooks/festival backgrounds, admin commission ledger, WhatsApp catalog sync, AI provider registry, plan/quota system...) is the *expected* count for a normalized relational schema, not a red flag. A rough rule of thumb: one feature domain rarely fits in fewer than 2-4 tables (a parent + its line items + its history/log) once you need real relationships and audit trails instead of a JSON blob.

Squeezing to 12-21 tables means one of:
- **Denormalizing into JSONB columns** (e.g. dumping all of `Campaign`, `Referral`, `Promotion`, `Booking` into one `growth_events` table with a `type` discriminator + JSONB payload). This is a real pattern (EAV / polymorphic tables) but it costs you: no foreign-key integrity on the payload fields, no per-type unique constraints, Postgres RLS (which this project relies on — see `kanchuki-rls-convention` memory: *"every retailer table needs RLS"*) gets much harder to write correctly per type, and every query needs `->>'field'` JSON extraction instead of a plain column.
- **Merging unrelated domains** (e.g. `Supplier` + `Partner` in one table because both are "external parties") — breaks the FK relationships to their actual child tables (`SupplierTransaction`, `PartnerReferral`, `PartnerEvent` have different shapes) and forces nullable columns for whichever type isn't active on a given row.

Neither improves anything you listed as a goal (reports, admin rollups, retailer/customer linkage) — those already work via the `retailer_id` hub pattern. Table *count* isn't a quality metric; foreign-key discipline and RLS coverage are, and those are already in place.

**What "9-21 tables and grow later" actually looks like in practice here:** you already have it, just inverted — start with the ~10 tables a bare-minimum MVP needs (Retailer, Product, ProductPhoto, Customer, Collection, CollectionProduct, Staff, Order, OrderItem, Subscription), and every feature after that adds 2-6 more tables on top, scoped to `retailer_id`. That's exactly the shape of what's in the schema today — it just kept growing because the feature list kept growing (52 features per `CLAUDE.md`). The table count is a *symptom* of feature count, not a design mistake to reverse.

### Known issues — CONFIRMED live via Supabase MCP, 2026-08-22

Checked directly against the production project (`thpqcylmcxokajxoerjx`, `ACTIVE_HEALTHY`, only one Kanchuki project — no staging/prod split to confuse) using `list_migrations`, `list_tables`, and read-only `execute_sql`. Replaces the earlier "very likely undeployed" guess in the first pass of this report with hard evidence:

1. **`CollectionStatus` enum confirmed** — live enum values are exactly `ACTIVE`, `EXPIRED`, `ARCHIVED`. No `HIDDEN`. Directly queried (`SELECT enumlabel FROM pg_enum JOIN pg_type ...`), not inferred.
2. **`_prisma_migrations` (Prisma's own tracking table) stops at `048_product_shadow`**, finished `2026-08-10 08:53 UTC`. Everything from `049` onward — 26 migration folders through `074` — is **unrecorded in migration history**, 12 days of drift as of this report.
3. **But the drift isn't uniform — schema and migration bookkeeping disagree with each other.** Tables that should only exist from migrations past `048` are already live: `campaigns`, `referrals`, `suppliers`, `bookings`, `partners`, `festival_backgrounds`, `lookbooks`, `social_templates`, `channel_syncs`, `plan_pricing`, `product_reviews`, `store_reviews`. Something applied most of that range's `CREATE TABLE` statements — `prisma db push` or manual SQL — without recording it as a tracked migration. Confirmed directly that `campaigns` is missing all 3 columns `064` adds (`variant_a_collection_id`, `variant_b_collection_id`, `cleanup_ttl_days`) — so **table creation landed, later ALTER-only migrations on those same tables did not.**
4. **Practical consequence:** a plain `prisma migrate deploy` will NOT cleanly fix this. It replays migrations in order starting from the first one Prisma doesn't have a record of (`049`) — and if `049`'s `CREATE TABLE` target already exists (likely, given #3), that statement errors out and the whole deploy aborts before it ever reaches `064`.
5. **Duplicate migration number** — two folders both numbered `069` (`069_design_gallery`, `069_social_media_templates`). Alphabetical ordering happens to keep them in a safe sequence (`d` < `s`), so it likely isn't breaking anything on its own, but worth renumbering to avoid confusing this exact kind of reconciliation work.
6. **No `Admin` table** — as covered in #1 (of the main report). Not broken (env-based admin auth works), but blocks per-admin audit trails and multi-admin permissions if you want that later.

#### Reconciliation plan (for you or whoever runs it — not run by me, prod-migration policy)

1. `cd packages/db && DATABASE_URL="<prod-url>" npx prisma migrate status` — Prisma will list exactly which of `049`-`074` it thinks are pending; cross-check each against whether its target table/column already exists live (the list above is a start, not exhaustive — there are 26 files to check).
2. For every migration whose changes are **already live** (most `CREATE TABLE`-only ones, going by the table list above): `npx prisma migrate resolve --applied "<migration_name>"` — tells Prisma's tracker "this already ran," without re-running it.
3. For migrations that are genuinely missing (confirmed so far: `064_ab_variant_collections` — enum value + 3 columns): let `npx prisma migrate deploy` apply those for real once the tracker is caught up on step 2.
4. Re-run `execute_sql` (or `prisma migrate status`) after to confirm `CollectionStatus` now includes `HIDDEN` and `campaigns` has the 3 new columns.

### Rating

**Schema design: excellent. Live deployment state: currently inconsistent, confirmed — not a guess anymore.**

- Schema design (normalization, FK discipline, hub pattern, RLS-friendly per-table structure, cuid IDs): **excellent** — this is how a platform this size *should* be modeled. All 73 live tables have RLS enabled (`rls_enabled: true` on every row checked), matching the project's own RLS convention.
- Deployment state: **confirmed broken in a specific, non-trivial way** — not "just run migrate deploy," because migration bookkeeping and actual schema have diverged (tables exist that migration history doesn't know about). This needs the reconciliation sequence above, not a one-liner.
- Once reconciled, this is an **excellent** rating with no caveats. The underlying design was never the problem — the deployment process (some combination of `db push` and `migrate deploy` used inconsistently over the last 12 days) is what needs discipline going forward: pick one workflow (`migrate deploy` only, from CI or an admin-dashboard-triggered step) and stop mixing it with direct pushes.

Table count staying at ~73 (and growing with every future feature) is correct and expected — don't chase a lower number as a goal.

## AI-content reports — `ai_content_reports` (migration 148, written 2026-11-02, NOT applied)

Shopper "Report this AI content" (Google Play AI-Generated Content policy). Text only; the AI output is never stored.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | cuid |
| `customer_account_id` | TEXT NULL | FK `customer_accounts` ON DELETE CASCADE; NULL = anonymous visitor, or unlinked by `/passport/delete` (soft delete) |
| `feature` | TEXT | one of 5 labels (`AI_REPORT_FEATURES`) |
| `content_ref` | TEXT NULL | store slug / product id |
| `description` | TEXT | 10-2000 chars |
| `status` | TEXT | `NEW` / `REVIEWED` (CHECK) |
| `created_at` | TIMESTAMP | indexed; also `(customer_account_id, created_at)` |

Writer: `routes/public/passport/passport-ai-report.ts` (INSERT); `passport-data.ts` (UPDATE unlink). No DELETE. RLS `backend_roles_full_access`.


## Social design templates — `design_templates` (migration 152, applied in prod 2026-11-04)

Admin-authored free post designs. `spec` is JSON `{ layers: [...] }` validated by `parseDesignSpec()` (`packages/shared/src/design-template.ts`) on every write and again before render. `status` reuses `PostTemplateStatus` (DRAFT | PUBLISHED | HIDDEN); `plans` empty = nobody. `format` is enum `DesignFormat` (SQUARE | PORTRAIT_4_5 | STORY_9_16 | LANDSCAPE_1_91_1 (1200x628, migration 157, applied in prod by owner 2026-11-14; enum value presence not yet read back)); `product_slots` 1..6 (CHECK). `background_key` / `thumbnail_key` are R2 keys under `admin/design-templates/`. **Writer:** `routes/admin/admin-design-templates.ts` only. `kanchuki_app` has no DELETE grant: designs are retired with status HIDDEN, never deleted. RLS policy `backend_roles_full_access` is created by the migration; prod presence not yet confirmed. **`ai_prompt`** (TEXT NULL, migration 164, NOT applied): when set the design is an AI style (product photo composed by the AI model from this prompt); CHECKs `design_templates_ai_prompt_len` (1..600 chars) and `design_templates_ai_prompt_one_slot` (requires `product_slots = 1`). Owner applies 164 before the API deploy (RC-160).

### Scheduler per-slide design text — `scheduled_post_items.design_vars` (migration 153, NOT applied)

Nullable JSONB `{custom_text?, offer_text?}` (each <= 80 chars, route-validated). Read only when `template_id` is an admin design id; NULL = those layers render empty. **Writer:** `retailers-social-schedule-style.ts` (style routes). Set to NULL whenever a slide is restyled to a built-in or reset.

## AI custom-prompt designs — `ai_custom_designs` (migrations 154 enums + 155 table, NOT applied)

One row per paid AI generation (T5). `id` = BullMQ job id = `quota_reservations.job_id`. `status` PENDING | READY | FAILED (CHECK). `prompt` is the retailer's sanitised text; `image_key` / `image_url` set only on READY (`retailers/<id>/designs/<hex>.jpg`). FKs cascade from `retailers` / `products`. **Writers:** `routes/retailers/retailers-social/retailers-social-ai-designs.ts` (insert PENDING) and `jobs/ai-custom-design.ts` (READY/FAILED). No DELETE grant. Migration 154 adds `PlanFeatureKey.AI_CUSTOM_TEMPLATE` (fails CLOSED) and `QuotaResourceType.AI_CUSTOM_TEMPLATE` (METERED: no `plan_limits` row = 0).

