# Kanchuki — Project Roadmap & Build Plan

**Version:** 1.0  
**Date:** June 2026  
**Total Timeline:** 18 months (MVP → Full Platform)

---

## Phase Overview

```
Phase 0: MVP           Month 1–4    Digitize store + WhatsApp collections
Phase 0.5: Internal Team  (post-MVP)  Admin/marketing/support staff logins + territory routing
Phase 1: AI Core       Month 5–8    Fashion DNA + Virtual Try-On
Phase 2: B2B Network   Month 9–12   Wholesaler/Manufacturer layer
Phase 3: Full Commerce Month 13–18  WhatsApp automation + payments + GST + multi-store
```

---

## Phase 0: MVP (Month 1–4)

**Goal:** 50 paying retailers, prove product-market fit  
**Revenue target:** First ₹50,000 MRR by Month 4  
**Team:** 2 developers, 1 designer, 1 founder doing sales

### Month 1: Foundation

**Week 1–2: Infrastructure Setup**
- [x] PostgreSQL 16 + pgvector on Railway/Supabase
- [x] Redis for cache + job queue (BullMQ + ioredis wired in API)
- [x] Cloudflare R2 bucket for images (presigned upload/download in @kanchuki/ai)
- [x] Supabase Auth (phone OTP)
- [x] Node.js + Fastify API scaffold
- [x] Next.js 14 customer web scaffold
- [x] React Native (Expo) retailer app scaffold
- [x] CI/CD pipeline — CI (`.github/workflows/ci.yml`: lint/typecheck/test/build) + CD to Railway (`.github/workflows/deploy.yml`) — **both operational, API + Web deployed live**
- [x] Environment config (.env structure, secrets management)
- [x] Basic logging (Pino)

**Week 3–4: Auth + Onboarding**
- [x] Phone OTP login for retailers (Supabase Auth)
- [x] Retailer registration: shop name, city, category, GSTIN
- [x] Store structure setup (racks/shelves — customizable)
- [x] Onboarding flow (guided 6-step setup)
- [x] Basic retailer dashboard shell

**Deliverable:** Retailer can create account and set up store structure

---

### Month 2: Product Catalog

**Week 5–6: Photo Upload + AI Tagging**
- [x] Camera + gallery upload in React Native
- [x] Image compression (client-side, < 500KB)
- [x] Upload to Cloudflare R2 via presigned URL
- [x] Claude Vision API call for auto-tagging
- [x] AI tag review + edit UI
- [x] Product save to PostgreSQL

**AI Tagging Prompt Design:**
- Extract: category, type, primary_color, secondary_colors[], fabric_estimate, pattern, embellishments[], neck_style, sleeve_type, occasion[], price_range_visible, design_notes, search_tags[]
- Must understand Indian ethnic wear vocabulary
- Return structured JSON

**Week 7–8: Catalog Features**
- [x] Product list view (grid + list toggle)
- [x] Product detail view
- [x] Store location assignment (Floor → Section → Rack → Shelf)
- [x] Product status (Available / Sold / Reserved)
- [x] Basic search by tag (client-side filter for MVP)
- [x] Bulk photo import (multiple images)
- [x] Multi-item detection & splitting from one photo (F-001c) — built 2026-07-13
- [x] PDF / printed-catalog bulk import (F-001b) — built 2026-07-13; dual-path: client-side + server-side page rasterization

**Deliverable:** Retailer can build full digital catalog with AI assistance

---

### Month 3: Customer CRM + Collection Links

**Week 9–10: Customer Module**
- [x] Add customer (name, phone, preferences)
- [x] Customer list + search
- [x] Customer profile with preference tags
- [x] Purchase history (manual entry)

**Week 11–12: WhatsApp Collection Links**
- [x] Product selection UI (checkboxes on catalog)
- [x] Collection creation: title, description, expiry
- [x] Collection page (Next.js SSG/ISR) — unique URL per collection
- [x] Collection view: product grid, filter, sort
- [x] Favorite (heart) button — stored in localStorage, no login needed
- [x] Enquiry button → pre-filled WhatsApp deep link to retailer
- [x] Retailer view: collection analytics (views, enquiries)

**Deliverable:** Retailer can share product collections via WhatsApp link

---

### Month 4: AI Search + Polish + Launch

**Week 13–14: In-Store AI Search**
- [x] Generate pgvector embeddings on product save (background job)
- [x] Semantic search endpoint (cosine similarity on product embeddings)
- [x] Natural language query → structured + semantic hybrid search
- [x] Results ranked by relevance + price filter
- [x] Hindi transliteration support (basic — map common words)

**Week 15–16: Polish + MVP Launch**
- [x] Filters on catalog (Category → Occasion → Price → Color) — mobile + web, client-side
- [x] Size Charts (F-102c) — full stack: schema, API, mobile UI, lookup logic (5 tests), recommend endpoint
- [x] Consent & Training Data (F-102d) — full stack: crop-tagging, consent collection, revocation flow, retention cron
- [x] Catalog Import (F-001b) — dual-path PDF + bulk photo import with item detection
- [x] Multi-Item Detection (F-001c) — detect C crop items from a single photo via Claude Vision bounding boxes
- [ ] Performance optimization (load time < 3s on 3G)
- [x] Error handling + offline resilience
- [ ] Onboarding tutorial improvements based on 10-retailer pilot
- [x] Analytics dashboard (basic + detailed analytics with daily trends, category breakdown)
- [x] Admin panel (retailer management, billing management, premium UI with email/password login, usage stats, trial extension, plan change) — **deployed live 2026-07-14**
- [x] Razorpay subscription integration (14-day trial) — **code-complete, deferred until production deploy**
    - Backend: cancel, create-order, verify-payment, webhook handler, setup-plans
    - Mobile: billing screen with plan cards, cancel subscription
    - Admin: plan management, setup-plans endpoint, extend-trial, change-plan
    - Blocked: needs live Razorpay credentials + webhook endpoint registered in Razorpay dashboard
- [x] Public landing page (Next.js)
- [x] CI/CD pipeline — CI (`.github/workflows/ci.yml`) + CD to Railway (`.github/workflows/deploy.yml`) — **both operational, API + Web deployed live**
- [ ] Pilot with 10 retailers, collect feedback, fix critical issues

**Deliverable:** MVP live, 50 retailer target

---

## Phase 0.5: Internal Team Management (Admin / Marketing / Support)

**Goal:** Move off single shared admin login to per-user staff accounts with territory-based access, so the marketing team can onboard retailers in-person and support can be routed by location. See `docs/PRO-REQUIREMENTS.md` Section 10, `docs/DATABASE.md` `TeamMember`/`Territory`/`SupportTicket` models.
**Prerequisite:** Phase 0 MVP live and stable (admin panel, retailer/product/collection flows).

- [x] Real per-user staff login (`TeamMember` table, hashed passwords) — API built (`POST /v1/team/login`, scrypt + JWT). Old admin-key login kept as a Super Admin bootstrap path, not yet retired.
- [x] `Territory` table (State → City → Zone hierarchy) + API CRUD (`/v1/team/territories`). No admin UI yet to build it visually.
- [x] `TeamMemberTerritory` assignment + `max_retailers` soft-cap flag — API done (`over_capacity` on `GET /v1/team/members`). No dashboard UI yet.
- [x] Retailer `territory_id` auto-derived from pincode at signup, `onboarded_by_id` / `support_owner_id` attribution — API done (`POST /v1/team/retailers`)
- [~] Marketing Agent onboarding flow — API endpoint done (`POST /v1/team/retailers`, scoped by role), no admin-panel UI surface yet (Phase A per §10.7)
- [ ] `SupportTicket` entity + hybrid routing (visit-required → nearest territory agent; backend-manageable → open pool within region) — schema/migration only, no routing logic or endpoints
- [ ] Manager rollup reporting: retailers onboarded per agent, coverage-gap view (zones with 0 assigned agent)
- [ ] Staff mode inside the Expo retailer app, for offline-friendly field onboarding

**Deliverable:** Marketing/support teams manage retailers through their own scoped logins instead of the shared admin key

---

## Phase 1: AI Core (Month 5–8)

**Goal:** Add Fashion DNA + Virtual Try-On, reach ₹3L MRR  
**Prerequisite:** 3+ months of retailer + customer behavior data from Phase 0

### Month 5–6: Fashion DNA Engine

**Customer Behavior Collection (retroactive from Phase 0 data):**
- Products favorited from collection links
- Products enquired about
- Dwell time on product (link analytics)
- Explicit preferences (from CRM)

**Fashion DNA Model:**
- Preference vector per customer: color affinities, style affinities, budget range, occasion matrix
- Vector stored in pgvector (1536-dim)
- Updated on every interaction

**AI Matching Features:**
- "Products this customer will love" — retailer can view for any customer
- Auto-suggest collection: AI picks best 12 products for specific customer
- "Customers who might like this product" — reverse matching

### Month 7–8: Virtual Try-On (Self-Hosted)

**Tech Choice:**
- **CatVTON (self-hosted)** — open-source, runs on <8GB VRAM, ~35s per image, $0.005/try-on
- **Strategy:** Deploy CatVTON first (3-5 days), fine-tune for Indian ethnic wear later (1-2 weeks)
- Quality gate: 80% acceptance rate on 50-sample ethnic wear test panel

**CatVTON specs:**
| Metric | Value |
|--------|-------|
| Cost per try-on | $0.005 (~₹0.4) |
| GPU needed | 8GB+ VRAM (RTX 3060) |
| Latency | ~35s |
| Indian wear quality | Good (improves with fine-tuning) |
| Monthly cost (1000 try-ons) | ~$5 |

**VTO Flow (Phase 1 — In-Store):**
1. Retailer selects product(s) customer wants to try
2. Customer takes selfie on retailer's tablet
3. AI generates try-on (~35 seconds)
4. Result shown on tablet/external display (TV mode)
5. Customer can save/share result image

**VTO Flow (Phase 1 — Remote via WhatsApp Manual):**
1. Customer receives collection link
2. Selects product, sees "Try This On" button
3. Uploads their photo (with consent modal)
4. AI generates result (queued job, < 1 min)
5. Result delivered via page + WhatsApp notification to retailer who forwards it

**Cost control:**
- Try-on credits system (bundled in plans)
- Real-time credit count shown to retailer
- Low-credit warning at 20% remaining

**Step 1 — Deploy CatVTON (3-5 days):**
1. Create Python/FastAPI microservice wrapping CatVTON model
2. Containerize with Docker
3. Deploy to RunPod/Jarvis Labs with L4 GPU ($0.44/hr, serverless billing)
4. Test end-to-end with sample products

**Step 2 — Fine-tune for Indian wear (1-2 weeks, after deployment):**
1. Collect 200-500 Indian garment photos from real product uploads
2. Create proper segmentation masks (SAM-based)
3. Run LoRA fine-tuning on CatVTON
4. Swap model weights in microservice — no app code changes needed
5. Retest with sarees, lehengas, unstitched suits

**Step 0 — Product/customer photo quality gate (do before Step 1 retest, cheap fix, likely root cause of early "no match" results):**
- Add bg-removal preprocessing (rembg/remove.bg) before every `triggerCatVTON` call
- Enforce ghost-mannequin/flat-lay product photo capture + plain-bg customer photo (see `docs/PRO-REQUIREMENTS.md` F-102)
- Multi-piece ethnic sets (kameez+salwar+dupatta): sequential upper/lower calls, dupatta excluded from CatVTON pass for MVP

**Deferred (not Phase 1 scope):** Measurement-driven body-shape rendering (SMPL/STAR 3D body model + pose-conditioned diffusion, e.g. IDM-VTON/OOTDiffusion) — evaluated, ~6-15x GPU cost vs CatVTON (₹0.4 → ₹2.5-6.5/try-on) for only ~10-20% photorealism gain on benchmarks that don't even cover ethnic wear. Revisit post-MVP if margin allows. Decision + numbers: `docs/adrs/ADR-006-defer-3d-parametric-vto.md`. Height/weight/measurements still used for size recommendation (F-102c, simple chart lookup, no GPU) — different feature, ships independently.

---

## Phase 2: B2B Supply Network (Month 9–12)

### Month 9–10: Wholesaler Module

- Wholesaler account type (separate onboarding)
- Bulk catalog upload (ZIP, CSV, PDF)
- Retailer network management (invite/accept)
- Catalog sharing with price override capability
- Order interest tracking (retailer marks interest → wholesaler notified)

### Month 11–12: Manufacturer Module

- Manufacturer account type
- Master catalog upload with design numbers
- Design popularity analytics (which designs viewed/ordered most)
- Access control: share only with approved wholesalers
- Catalog watermarking (prevent unauthorized distribution)

---

## Phase 3: Full Commerce (Month 13–18)

### Month 13–14: WhatsApp Business API Automation

- Meta Cloud API integration
- Automated collection delivery (retailer schedules, system sends)
- Automated follow-up messages
- Customer opt-in/opt-out management
- Conversation inbox for retailer
- Meta conversation fee pass-through billing

### Month 15–16: Payments + GST

- UPI payment link generation per order (Razorpay)
- Order confirmation + receipt
- **GST invoice generation (CRITICAL)**:
  - GSTIN validation
  - HSN code mapping for apparel
  - B2C + B2B invoice formats
  - GSTR-1 export
- Advance booking / deposit collection

### Month 17–18: Enterprise Features

- Multi-store management (1 retailer, multiple shop branches)
- Multi-staff roles (owner / salesperson / admin)
- Regional language UI: Hindi (priority), Gujarati, Punjabi
- Advanced analytics: customer lifetime value, product performance, seasonal trends
- API for third-party integrations (accounting tools, POS)

---

## Technology Build Order

```mermaid
graph TD
    A[Infrastructure + Auth] --> B[Photo Upload + AI Tagging]
    B --> C[Product Catalog]
    C --> D[Customer CRM]
    D --> E[Collection Links]
    C --> F[In-Store AI Search]
    E --> G[Fashion DNA Engine]
    G --> H[Virtual Try-On]
    H --> I[Remote VTO via WhatsApp]
    D --> J[Wholesaler Module]
    J --> K[Manufacturer Module]
    I --> L[WhatsApp API Automation]
    L --> M[GST + Payments]
    M --> N[Multi-store + Enterprise]
```

---

## Milestones & Success Gates

| Milestone | Month | Gate Criteria |
|-----------|-------|--------------|
| Infrastructure ready | M1 | Deploy endpoint responds, DB seeded |
| AI tagging working | M2 | 80% tag accuracy on 50-image test set |
| First retailer onboarded | M2 | Retailer uploads 20+ products |
| Collection link live | M3 | Customer opens link on mobile, enquires |
| MVP beta | M4 | 10 pilot retailers, real feedback |
| MVP public | M4 | 50 paying retailers |
| CatVTON self-hosted deployed | M5 | Try-on working on 10 test products |
| CatVTON fine-tuned for Indian wear | M6 | 80% quality on saree/lehenga test set |
| Fashion DNA live | M7 | 1000+ customer behavior events, matching visible |
| VTO in-store live | M8 | Full VTO flow with fine-tuned model |
| Wholesaler beta | M10 | 5 wholesalers sharing catalogs with retailers |
| WhatsApp automation | M14 | 100 retailers using automated sends |
| GST compliance | M16 | GST invoice generated for every sale |
| Regional languages | M18 | Hindi UI live, Gujarati in beta |

---

## Resource Plan

### Team (MVP — Month 1–4)
- **1 Full-Stack Dev** — Backend API + DB (Node.js + PostgreSQL)
- **1 Frontend Dev** — React Native app + Next.js customer web
- **1 Designer** — UI/UX (Figma), mobile-first
- **1 Founder** — Sales, retailer onboarding, product decisions

### Team (Phase 1 — Month 5–8)
- Add: **1 ML/AI Engineer** — Fashion DNA model, VTO integration
- Add: **1 QA/DevOps** — Testing, monitoring, CI/CD

### Team (Phase 2–3 — Month 9–18)
- Add: **1 Backend Dev** — B2B supply chain, WhatsApp API
- Add: **1 Business Dev** — Wholesaler/manufacturer partnerships

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| VTO quality unacceptable | Test on 50 ethnic wear samples before shipping; fine-tune CatVTON with LoRA for Indian garments |
| Retailer upload behavior drops off | Gamify (streak, leaderboard), offer human onboarding support for first 50 products |
| WhatsApp API account ban | Build SMS fallback (MSG91) from Day 1; never spam |
| AI tagging cost spike | Cache embeddings; batch process; use Claude Haiku for bulk |
| Meta API pricing change | Decouple WhatsApp module behind feature flag; SMS/email always available |
| Competitor replication | Speed to market + deep ethnic wear quality + retailer network effects |
| Jio/Reliance entry | Focus on Tier 2–3 cities where distribution advantage is smaller |

---

## Budget Estimates (MVP — 4 months)

| Category | Monthly | 4-Month Total |
|----------|---------|--------------|
| Infrastructure (Railway/Supabase/R2/Cloudflare) | ₹15,000 | ₹60,000 |
| Claude Vision API (AI tagging, 500 retailers × 100 products) | ₹20,000 | ₹80,000 |
| Razorpay setup | ₹0 (% of txn) | ₹0 |
| Developer salaries (2) | ₹2,00,000 | ₹8,00,000 |
| Designer | ₹75,000 | ₹3,00,000 |
| Marketing/Sales | ₹50,000 | ₹2,00,000 |
| **Total** | **₹3,60,000** | **₹14,40,000** |

**Break-even:** 145 Growth plan retailers (₹2,499 × 145 = ₹3,62,355/month)
