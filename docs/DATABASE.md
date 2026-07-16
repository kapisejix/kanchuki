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
  
  @@index([phone])
  @@index([city])
  @@index([territory_id])
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
// Not yet built — see PRO-REQUIREMENTS.md Section 10
// ─────────────────────────────────────────────

model TeamMember {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  password_hash String
  role          TeamRole
  is_active     Boolean  @default(true)
  max_retailers Int?     // soft cap; dashboard flags when exceeded, never blocks onboarding

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  territories         TeamMemberTerritory[]
  onboarded_retailers Retailer[] @relation("OnboardedRetailers")
  supported_retailers Retailer[] @relation("SupportedRetailers")
  assigned_tickets    SupportTicket[]

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

  created_at DateTime  @default(now())
  resolved_at DateTime?

  retailer    Retailer    @relation(fields: [retailer_id], references: [id])
  assigned_to TeamMember? @relation(fields: [assigned_to_id], references: [id])

  @@index([retailer_id])
  @@index([status])
  @@map("support_tickets")
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
```

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

---

## Migrations Strategy

- All schema changes via Prisma migrations (`prisma migrate dev`)
- Breaking changes: never drop columns in-place — deprecate first, migrate data, then drop
- Zero-downtime: add nullable columns, then backfill, then add NOT NULL constraint
- See `skill://database-migrations` for full patterns
