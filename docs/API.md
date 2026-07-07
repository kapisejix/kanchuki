# Kanchuki — API Design

**Version:** 1.0  
**Date:** June 2026  
**Framework:** Node.js + Fastify 4  
**Auth:** Supabase JWT (Bearer token)  
**Base URL:** `https://api.kanchuki.app/v1`

---

## Design Principles

- REST over HTTP/1.1 (not GraphQL — simpler for mobile app)
- JSON everywhere (`Content-Type: application/json`)
- Consistent error shape
- Idempotent writes where possible
- Pagination on all list endpoints
- All money in INR as integers (paise: ₹99 = 9900)

---

## Authentication

All endpoints (except public collection endpoints) require:
```
Authorization: Bearer {supabase_access_token}
```

Token obtained via Supabase Auth phone OTP flow (handled by Supabase SDK, not our API).

---

## Error Response Format

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product not found or does not belong to your store",
    "field": "product_id",    // optional, for validation errors
    "status": 404
  }
}
```

**Error codes:**
- `UNAUTHORIZED` — missing/invalid JWT
- `FORBIDDEN` — JWT valid but no access to this resource
- `NOT_FOUND` — resource doesn't exist or belongs to other tenant
- `VALIDATION_ERROR` — input validation failed (details in `field`)
- `RATE_LIMITED` — too many requests
- `PLAN_LIMIT_EXCEEDED` — subscription plan limit reached
- `AI_ERROR` — AI service failed (retry)

---

## Pagination

All list endpoints use cursor-based pagination:
```
GET /products?cursor=clxyz&limit=20
```

Response:
```json
{
  "data": [...],
  "pagination": {
    "cursor": "clnext123",   // pass as ?cursor= for next page
    "has_more": true,
    "total": 247             // only on first page (expensive, cached)
  }
}
```

---

## Endpoints

### Auth

```
POST /auth/otp/send
POST /auth/otp/verify
POST /auth/refresh
DELETE /auth/session        # logout
```

---

### Retailers

```
GET  /retailers/me          # Current retailer profile
PUT  /retailers/me          # Update shop name, city, GSTIN, etc.
GET  /retailers/me/stats    # Dashboard stats
GET  /retailers/me/plan     # Subscription plan info + limits + credits
```

---

### Store Structure

```
GET  /store/sections        # All racks/shelves
POST /store/sections        # Create section
PUT  /store/sections/:id    # Update section name/type
DELETE /store/sections/:id  # Delete (only if no products assigned)
```

---

### Products

#### Upload Flow
```
POST /products/upload-url   # Get presigned R2 upload URL
Body: { filename: "photo.jpg", content_type: "image/jpeg", size_bytes: 245000 }
Response: { upload_url: "...", r2_key: "retailers/xxx/products/yyy/abc.jpg" }

POST /products/tag          # Trigger AI tagging after upload
Body: { r2_key: "..." }
Response: { job_id: "...", status: "queued" }

GET  /products/tag/:job_id  # Poll tagging status
Response: { status: "completed", tags: { category: "...", colors: [...] } }
```

#### CRUD
```
POST /products              # Create product (with r2_key of uploaded photo)
Body:
{
  "photo_r2_key": "retailers/xxx/...",
  "price_min": 150000,          // paise (₹1500)
  "price_max": 200000,          // paise (₹2000)
  "category": "Ladies Suit",
  "product_type": "Unstitched",
  "primary_color": "Pink",
  "secondary_colors": ["Gold"],
  "fabric_estimate": "Cotton",
  "pattern": "Embroidered",
  "occasions": ["Party Wear", "Wedding"],
  "search_tags": ["pink", "cotton", "party", "embroidered"],
  "section_id": "clxxx",
  "location_notes": "Stack 2",
  "status": "AVAILABLE",
  "metadata": { "design_number": "1045" }
}

GET    /products             # List products (paginated, filterable)
Query: ?status=AVAILABLE&category=Saree&color=Pink&price_max=300000&cursor=...

GET    /products/:id         # Single product
PUT    /products/:id         # Update product
DELETE /products/:id         # Soft delete

POST   /products/:id/photos  # Add more photos to existing product
DELETE /products/:id/photos/:photo_id

PATCH  /products/:id/status  # Quick status change
Body: { "status": "SOLD" }
```

#### Search
```
POST /products/search
Body:
{
  "query": "light pink cotton suit under 2500",   // natural language
  "filters": {
    "status": "AVAILABLE",
    "price_max": 250000,        // paise
    "category": "Ladies Suit"
  },
  "limit": 12
}
Response:
{
  "products": [...],
  "query_interpretation": {
    "color": "Pink",
    "fabric": "Cotton",
    "type": "Ladies Suit",
    "budget_max": 2500
  }
}
```

---

### Customers

```
POST   /customers           # Add customer
Body: { name, phone, pref_colors[], pref_styles[], budget_min, budget_max, notes }

GET    /customers           # List (paginated)
Query: ?search=Priya&cursor=...

GET    /customers/:id       # Single customer profile
PUT    /customers/:id       # Update preferences/notes
DELETE /customers/:id       # Soft delete

GET    /customers/:id/matches    # Phase 1 — AI-matched products
Response: { products: [...], confidence: 0.87 }

GET    /customers/:id/interactions  # All interactions (views, enquiries, purchases)
```

---

### Collections

```
POST /collections
Body:
{
  "title": "Festive Collection 2026",
  "description": "Diwali special picks",
  "product_ids": ["clxxx", "clyyy", ...],
  "customer_id": "clzzz",   // optional — for customer-specific collections
  "expires_days": 30
}
Response: {
  "id": "clcollect",
  "slug": "festive-2026-a3b4",
  "url": "https://kanchuki.app/c/festive-2026-a3b4"
}

GET    /collections          # List retailer's collections
GET    /collections/:id      # Collection details + analytics
PUT    /collections/:id      # Update title/description/products
DELETE /collections/:id      # Soft delete / archive

GET    /collections/:id/analytics   # Views + enquiries + favorites breakdown
GET    /collections/:id/enquiries   # List enquiries
PATCH  /collections/:id/enquiries/:enquiry_id   # Mark enquiry as seen/replied/closed
```

---

### Public Collection Endpoints (No Auth)

```
GET  /public/collections/:slug         # Collection page data (for customer web)
Response: {
  "retailer": { "shop_name": "Priya Fashions", "city": "Surat" },
  "title": "Festive Collection 2026",
  "products": [...],
  "expires_at": "2026-07-30"
}

POST /public/collections/:slug/view    # Record a view (anonymous)
Body: { "viewer_token": "anon_session_id" }

POST /public/collections/:slug/enquire  # Customer enquires
Body: {
  "product_id": "clxxx",
  "customer_name": "Priya",      // optional
  "customer_phone": "9876543210", // optional
  "message": "Interested in pink suit"
}
```

---

### Virtual Try-On (Phase 1)

```
POST /try-on/upload-url     # Get presigned URL for customer photo upload
Body: { content_type: "image/jpeg" }

POST /try-on/jobs
Body: {
  "product_id": "clxxx",
  "customer_photo_r2_key": "try_on_jobs/abc/input.jpg",
  "collection_id": "clccc"   // optional — for analytics
}
Response: { "job_id": "cljob", "status": "queued", "estimated_seconds": 25 }

GET  /try-on/jobs/:id        # Poll status
Response: {
  "status": "completed",  // "queued" | "processing" | "completed" | "failed"
  "result_url": "https://...",   // signed URL, 24h expiry
  "api_cost_usd": 0.08
}

DELETE /try-on/jobs/:id/result   # Customer requests early deletion of result
```

---

### Analytics

```
GET /analytics/dashboard     # Summary stats for current month
GET /analytics/products/top  # Top performing products
GET /analytics/collections   # Collection performance breakdown
```

---

### Billing / Subscription

```
GET  /billing/plans          # Available plans + pricing
GET  /billing/subscription   # Current subscription state
POST /billing/subscription   # Start subscription (redirect to Razorpay)
POST /billing/webhook        # Razorpay webhook (internal, validated)
GET  /billing/invoices       # List invoices
GET  /billing/invoices/:id   # Download GST invoice (PDF)
```

---

### Admin Endpoints

All under `/admin` — requires admin role JWT:

```
GET  /admin/retailers        # All retailers + usage stats
GET  /admin/retailers/:id    # Retailer detail
POST /admin/retailers/:id/credit-tryon  # Grant try-on credits
GET  /admin/metrics          # Platform-wide metrics
GET  /admin/jobs             # BullMQ job queue status
```

---

## Background Job Architecture (BullMQ)

```
Queue: kanchuki:ai-tagging
  Job: tag-product
  Payload: { product_photo_r2_key, retailer_id, product_id }
  Priority: high
  Attempts: 3
  Backoff: exponential (5s, 25s, 125s)
  OnComplete: update product with AI tags, generate embedding
  OnFail: mark product as "tagging failed", notify retailer

Queue: kanchuki:embeddings
  Job: generate-embedding
  Payload: { product_id, text_input }
  Priority: normal
  Attempts: 3
  OnComplete: update product_embeddings table

Queue: kanchuki:try-on
  Job: process-try-on
  Payload: { job_id, product_id, customer_photo_r2_key }
  Priority: high
  Attempts: 2
  Timeout: 120000ms (2 minutes)
  OnComplete: upload result to R2, delete input photo, update job record
  OnFail: mark job as failed, delete input photo regardless

Queue: kanchuki:cleanup
  Job: delete-expired-tryon-results (cron: every hour)
  Job: delete-soft-deleted-records (cron: daily at 2am IST)
  Job: refresh-collection-stats (cron: every 5 minutes)
```

---

## API Versioning

- Current: `/v1/`
- Breaking changes → new version `/v2/`
- Old version supported for 6 months after new version launch
- Deprecation headers: `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`

---

## OpenAPI Documentation

Generated via Fastify + `@fastify/swagger`:
- Dev: `http://localhost:3000/docs`
- Prod: internal only (not public)

---

## Client SDKs (Planned)

- React Native: auto-generated from OpenAPI spec via `orval`
- TypeScript web: same
- No external partners in MVP — no public API keys
