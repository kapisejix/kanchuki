# Kanchuki — Database Schema

**Version:** 1.0  
**Engine:** PostgreSQL 16 + pgvector 0.7  
**ORM:** Prisma 5  
**Hosting:** Supabase (managed)

---

## Design Principles

1. **Row-Level Security (RLS):** Every retailer's data is isolated at DB level. `retailer_id` on every table, RLS policy enforces it.
2. **JSONB for flexible metadata:** Product attributes are domain-specific and evolving. Use `metadata JSONB` rather than 30 columns.
3. **pgvector for AI:** Product embeddings and customer Fashion DNA stored natively. No separate vector DB needed at MVP scale.
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

customers ──── customer_fashion_dna (1:1, Phase 1)
customers ──── customer_interactions (1:many)
customers ──── customer_measurements (1:many, Phase 1 — VTO fit input)

try_on_jobs ──── customer_measurements (M:1, optional — measurement snapshot used for fit)

wholesalers ──── wholesaler_catalogs (Phase 2)
manufacturers ──── manufacturer_designs (Phase 2)

subscriptions ──── subscription_events (billing history)
try_on_jobs (Phase 1, ephemeral)

retailers ──── retailer_payment_accounts (1:1, Phase 3 — F-302/F-307)
retailers ──── orders (1:many, Phase 3 — F-302)
orders ──── order_items (1:many, Phase 3 — F-302)
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

enum TryOnStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}

enum MeasurementSource {
  PHOTO   // derived from front+back photo via pose estimation
  MANUAL  // entered directly via inch-tape
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
  try_on_credits  Int     @default(0)
  
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

// Phase 1: Body measurements for VTO fit — either photo-derived or manual (inch-tape)
model CustomerMeasurement {
  id          String  @id @default(cuid())
  customer_id String
  retailer_id String  // denormalized for RLS
  
  source      MeasurementSource
  
  // Core (upper body / kurta-suit fit)
  height_cm   Decimal
  bust_cm     Decimal?
  waist_cm    Decimal?
  hip_cm      Decimal?
  
  // Lower body (pant/salwar fit)
  pant_waist_cm Decimal?
  pant_hip_cm   Decimal?
  inseam_cm     Decimal?
  
  // Photo path only — originals deleted right after landmark extraction
  front_photo_r2_key  String?
  back_photo_r2_key   String?
  photo_deleted_at    DateTime?
  pose_landmarks_json Json?    // MediaPipe keypoints, kept for re-scale if height corrected
  confidence_score    Float?   // 0-1, photo-derived estimate quality
  
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  
  customer    Customer @relation(fields: [customer_id], references: [id], onDelete: Cascade)
  try_on_jobs TryOnJob[]
  
  @@index([customer_id])
  @@index([retailer_id])
  @@map("customer_measurements")
}

// Phase 1: AI-learned preference vector
model CustomerFashionDNA {
  id          String  @id @default(cuid())
  customer_id String  @unique
  retailer_id String
  
  // Learned preference vector (pgvector, 1536-dim)
  preference_vector Unsupported("vector(1536)")?
  
  // Computed scores (0.0 – 1.0)
  color_affinities   Json  // {"Pink": 0.87, "Maroon": 0.65, ...}
  style_affinities   Json  // {"Party Wear": 0.9, "Casual": 0.3}
  fabric_affinities  Json  // {"Cotton": 0.75, ...}
  occasion_affinities Json // {"Wedding": 0.9, "Office": 0.2}
  budget_range       Json  // {"min": 1500, "max": 5000, "sweet_spot": 2500}
  
  // Meta
  interaction_count  Int @default(0)
  confidence_score   Float @default(0.0) // 0-1, how confident AI is
  last_updated_at    DateTime @default(now())
  
  customer    Customer @relation(fields: [customer_id], references: [id], onDelete: Cascade)
  
  @@index([retailer_id])
  @@map("customer_fashion_dna")
}

model CustomerInteraction {
  id          String  @id @default(cuid())
  customer_id String
  retailer_id String
  product_id  String?
  collection_id String?
  
  type        String  // "view" | "favorite" | "enquiry" | "purchase" | "try_on"
  metadata    Json?   // {"dwell_ms": 3400, "color_selected": "Pink"}
  
  created_at  DateTime @default(now())
  
  customer    Customer @relation(fields: [customer_id], references: [id], onDelete: Cascade)
  product     Product? @relation(fields: [product_id], references: [id])
  
  @@index([customer_id])
  @@index([retailer_id, created_at])
  @@map("customer_interactions")
}

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
  
  product_id    String?  // which product(s) interested in
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

// ─────────────────────────────────────────────
// VIRTUAL TRY-ON (Phase 1)
// ─────────────────────────────────────────────

model TryOnJob {
  id          String  @id @default(cuid())
  retailer_id String
  
  product_id  String
  measurement_id String?  // optional — measurement snapshot used to scale/fit garment
  customer_photo_r2_key String  // ephemeral — deleted after processing
  result_r2_key String?         // result — deleted after 24h
  result_url  String?
  
  status      TryOnStatus @default(QUEUED)
  error_message String?
  
  api_provider String  // "vton" — self-hosted Fashion V-Tone engine
  api_job_id  String?  // external job ID
  api_cost_usd Float?  // cost in USD for this job
  
  measurement CustomerMeasurement? @relation(fields: [measurement_id], references: [id])
  
  // Timing
  queued_at   DateTime @default(now())
  started_at  DateTime?
  completed_at DateTime?
  
  // Ephemeral cleanup
  customer_photo_deleted_at DateTime?  // MUST be deleted after job
  result_expires_at DateTime?          // result URL expires in 24h
  
  @@index([retailer_id])
  @@index([status])
  @@map("try_on_jobs")
}

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
// L2 ECOMMERCE CHECKOUT (Phase 3 — F-302/F-307)
// Planned only — decided 2026-07-24, no migration written yet.
// ─────────────────────────────────────────────

enum PaymentMode {
  DIRECT  // Stage A — retailer's own Razorpay account, keys stored here (encrypted)
  ROUTE   // Stage B — Razorpay Linked Account, Kanchuki's account is merchant-of-record
}

enum RouteOnboardingStatus {
  PENDING
  ACTIVE
  REJECTED
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  CANCELLED
  REFUNDED
  FULFILLED
}

// One row per retailer who has turned on checkout. Existence of an ACTIVE
// row here is the whole L1/L2 gate — no separate feature-flag column.
model RetailerPaymentAccount {
  id          String      @id @default(cuid())
  retailer_id String      @unique
  payment_mode PaymentMode @default(DIRECT)

  // Stage A (DIRECT) — reuses packages/db/src/secrets.ts encryptSecret()/
  // decryptSecret() (AES-256-GCM, same mechanism as F-012 IntegrationSetting)
  // but keyed per-retailer here instead of the global admin-only table.
  razorpay_key_id                 String?  // public-ish, not secret — plaintext ok
  razorpay_key_secret_encrypted   String?  // AES-256-GCM, same format as IntegrationSetting.encrypted_value
  razorpay_webhook_secret_encrypted String? // used to verify Stage A webhook signatures

  // Stage B (ROUTE)
  razorpay_linked_account_id String?
  route_status                RouteOnboardingStatus?
  onboarding_url               String?  // Razorpay-hosted KYC link, short-lived

  is_active   Boolean   @default(false)
  verified_at DateTime?
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  retailer    Retailer @relation(fields: [retailer_id], references: [id])

  @@map("retailer_payment_accounts")
}

model Order {
  id            String      @id @default(cuid())
  retailer_id   String
  collection_id String?     // which collection link the customer bought from, if any

  // No reusable Address entity — checkout is anonymous (no customer login
  // anywhere else in this app), so the address is a one-time order snapshot,
  // not a profile a customer could reuse.
  customer_name    String
  customer_phone   String
  shipping_address Json     // { line1, line2?, city, state, pincode }

  status OrderStatus @default(PENDING_PAYMENT)

  // Amounts in paise, same convention as Product.price_min/max
  subtotal_amount Int
  gst_amount      Int
  total_amount    Int

  payment_mode PaymentMode  // snapshotted from RetailerPaymentAccount at order-create time
  razorpay_order_id   String? @unique
  razorpay_payment_id String?

  gst_invoice_number String?

  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt
  paid_at      DateTime?
  cancelled_at DateTime?

  retailer Retailer    @relation(fields: [retailer_id], references: [id])
  items    OrderItem[]

  @@index([retailer_id])
  @@index([status])
  @@map("orders")
}

model OrderItem {
  id         String @id @default(cuid())
  order_id   String
  product_id String

  // Snapshotted at order time — retailer catalog price/name can change later
  product_name_snapshot String?
  price_snapshot         Int
  quantity               Int @default(1) // practically always 1 — see F-302 note:
                                          // one Product row = one physical garment
                                          // (AVAILABLE/SOLD), not a stock-count SKU

  order   Order   @relation(fields: [order_id], references: [id], onDelete: Cascade)
  product Product @relation(fields: [product_id], references: [id])

  @@index([order_id])
  @@map("order_items")
}
```

---

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

-- Customer DNA similarity
CREATE INDEX idx_customer_dna_vector ON customer_fashion_dna 
  USING ivfflat (preference_vector vector_cosine_ops)
  WITH (lists = 50);
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
-- docs/superpowers/specs/2026-08-30-studio-styles-admin-design.md):
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
| Customer photos (VTO input) | **Deleted immediately after job completes** | TryOnJob.completed_at set |
| Measurement photos (front/back input) | **Deleted immediately after landmark extraction** | CustomerMeasurement.photo_deleted_at set |
| VTO result images | 24 hours | Cron job cleanup |
| Product photos | Retained while product active | Product.deleted_at marks removal |
| Collection views | 90 days | Cron cleanup of old view records |
| Audit logs | 3 years | Regulatory compliance |
| Payment records | 7 years | GST/IT compliance |
| Soft-deleted records | 30 days then hard delete | Cron cleanup |
| Orders (F-302, planned) | 7 years | Same GST/IT compliance window as SubscriptionPayment |
| Retailer Razorpay keys (F-302, planned) | Until retailer disconnects the account | Deleted, not soft-deleted — see `docs/SECURITY.md` §11 |
| Deletion Vault records (F-016, planned) | Indefinite by default | Written at soft-delete time; hard-purge only via manual audited admin action, never automatic |

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

**Tables protected (8 triggers):**

| Table | Trigger Name | Purpose |
|-------|-------------|---------|
| `products` | `guard_products_delete` | Protect product catalog — use `deleted_at` instead |
| `customers` | `guard_customers_delete` | Protect retailer CRM data — use `deleted_at` instead |
| `retailers` | `guard_retailers_delete` | Protect account records — use `deleted_at` instead |
| `collections` | `guard_collections_delete` | Protect collection links — use `deleted_at` instead |
| `staff` | `guard_staff_delete` | Protect staff accounts — use `is_active = false` instead |
| `orders` | `guard_orders_delete` | Protect order history (GST compliance) |
| `order_items` | `guard_order_items_delete` | Protect order line items |
| `product_variants` | `guard_product_variants_delete` | Protect color variants — use soft-delete instead |

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
`docs/DATABASE.md` "Deletion Vault" provides an independent copy of every
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

## Migrations Strategy

- All schema changes via Prisma migrations (`prisma migrate dev`)
- Breaking changes: never drop columns in-place — deprecate first, migrate data, then drop
- Zero-downtime: add nullable columns, then backfill, then add NOT NULL constraint
- See `skill://database-migrations` for full patterns
